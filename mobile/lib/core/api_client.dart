import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import 'api_exception.dart';
import 'app_config.dart';
import 'token_store.dart';

typedef ProgressCallback = void Function(int sent, int total);

/// A file to upload via multipart/form-data.
/// Provide either a [path] (mobile/desktop) or raw [bytes] (works on web too).
class UploadFile {
  const UploadFile({required this.field, this.path, this.bytes, this.filename});

  final String field;
  final String? path;
  final List<int>? bytes;
  final String? filename;
}

/// Thin, typed-ish HTTP layer over the RoadWatch API.
///
/// Handles bearer auth, automatic single refresh-and-retry on 401, JSON
/// decoding, structured errors and multipart uploads with progress.
class ApiClient {
  ApiClient({TokenStore? tokenStore, http.Client? httpClient, String? baseUrl})
      : tokens = tokenStore ?? TokenStore(),
        _http = httpClient ?? http.Client(),
        _baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  final TokenStore tokens;
  final http.Client _http;
  final String _baseUrl;

  /// Invoked on a 401 so the app can rotate tokens; returns true on success.
  Future<bool> Function()? onUnauthorized;

  static const Duration _timeout = Duration(seconds: 30);

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final base = _baseUrl.endsWith('/') ? _baseUrl.substring(0, _baseUrl.length - 1) : _baseUrl;
    final p = path.startsWith('/') ? path : '/$path';
    final uri = Uri.parse('$base$p');
    if (query == null || query.isEmpty) return uri;
    final params = <String, String>{...uri.queryParameters};
    query.forEach((k, v) {
      if (v == null) return;
      final s = v.toString();
      if (s.isNotEmpty) params[k] = s;
    });
    return uri.replace(queryParameters: params);
  }

  Future<Map<String, String>> _headers({required bool json, bool auth = true}) async {
    final headers = <String, String>{'Accept': 'application/json'};
    if (json) headers['Content-Type'] = 'application/json';
    if (auth) {
      final token = await tokens.readAccessToken();
      if (token != null) headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  dynamic _decode(http.Response res) {
    dynamic body;
    if (res.bodyBytes.isNotEmpty) {
      try {
        body = jsonDecode(utf8.decode(res.bodyBytes));
      } catch (_) {
        body = null;
      }
    }

    if (res.statusCode >= 200 && res.statusCode < 300) return body;

    String? message;
    String? code;
    Object? details;
    if (body is Map && body['error'] is Map) {
      final err = body['error'] as Map;
      message = err['message']?.toString();
      code = err['code']?.toString();
      details = err['details'];
    }

    throw ApiException(
      message ?? 'Request failed (${res.statusCode}).',
      code: code ?? 'HTTP_${res.statusCode}',
      statusCode: res.statusCode,
      details: details,
    );
  }

  Future<dynamic> _send(Future<http.Response> Function() run, {bool auth = true, bool retry = true}) async {
    http.Response res;
    try {
      res = await run().timeout(_timeout);
    } on TimeoutException {
      throw ApiException.timeout();
    } on ApiException {
      rethrow;
    } catch (_) {
      throw ApiException.network();
    }

    if (res.statusCode == 401 && auth && retry && onUnauthorized != null) {
      final refreshed = await onUnauthorized!.call();
      if (refreshed) return _send(run, auth: auth, retry: false);
    }

    return _decode(res);
  }

  Future<dynamic> getJson(String path, {Map<String, dynamic>? query, bool auth = true}) {
    return _send(() async => _http.get(_uri(path, query), headers: await _headers(json: false, auth: auth)),
        auth: auth);
  }

  Future<dynamic> postJson(String path, {Object? body, bool auth = true}) {
    return _send(
      () async => _http.post(_uri(path), headers: await _headers(json: true, auth: auth), body: jsonEncode(body ?? {})),
      auth: auth,
    );
  }

  Future<dynamic> patchJson(String path, {Object? body, bool auth = true}) {
    return _send(
      () async => _http.patch(_uri(path), headers: await _headers(json: true, auth: auth), body: jsonEncode(body ?? {})),
      auth: auth,
    );
  }

  Future<dynamic> deleteJson(String path, {bool auth = true}) {
    return _send(() async => _http.delete(_uri(path), headers: await _headers(json: false, auth: auth)), auth: auth);
  }

  Future<dynamic> postMultipart(
    String path, {
    Map<String, String> fields = const {},
    List<UploadFile> files = const [],
    ProgressCallback? onProgress,
  }) {
    return _send(() async {
      final request = _ProgressMultipartRequest('POST', _uri(path), onProgress: onProgress);
      request.headers.addAll(await _headers(json: false));
      fields.forEach((k, v) {
        if (v.isNotEmpty) request.fields[k] = v;
      });
      for (final file in files) {
        final name = file.filename ?? file.path ?? 'photo.jpg';
        final mediaType = _mediaTypeForPath(name);
        if (file.bytes != null) {
          request.files.add(
            http.MultipartFile.fromBytes(file.field, file.bytes!, filename: name, contentType: mediaType),
          );
        } else if (file.path != null) {
          request.files.add(
            await http.MultipartFile.fromPath(file.field, file.path!, filename: name, contentType: mediaType),
          );
        }
      }
      final streamed = await _http.send(request);
      return http.Response.fromStream(streamed);
    });
  }

  void close() => _http.close();
}

MediaType _mediaTypeForPath(String path) {
  final lower = path.toLowerCase();
  if (lower.endsWith('.png')) return MediaType('image', 'png');
  if (lower.endsWith('.webp')) return MediaType('image', 'webp');
  if (lower.endsWith('.heic')) return MediaType('image', 'heic');
  if (lower.endsWith('.heif')) return MediaType('image', 'heif');
  if (lower.endsWith('.gif')) return MediaType('image', 'gif');
  return MediaType('image', 'jpeg');
}

/// MultipartRequest that reports upload progress.
class _ProgressMultipartRequest extends http.MultipartRequest {
  _ProgressMultipartRequest(super.method, super.url, {this.onProgress});

  final ProgressCallback? onProgress;

  @override
  http.ByteStream finalize() {
    final byteStream = super.finalize();
    final total = contentLength;
    var sent = 0;
    final transformer = StreamTransformer<List<int>, List<int>>.fromHandlers(
      handleData: (data, sink) {
        sent += data.length;
        onProgress?.call(sent, total);
        sink.add(data);
      },
    );
    return http.ByteStream(byteStream.transform(transformer));
  }
}
