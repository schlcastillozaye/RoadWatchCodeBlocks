/// Error surfaced by the API layer, carrying a user-presentable message.
class ApiException implements Exception {
  final String message;
  final String code;
  final int? statusCode;
  final Object? details;

  const ApiException(this.message, {this.code = 'UNKNOWN', this.statusCode, this.details});

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNetworkError => code == 'NETWORK';

  factory ApiException.network([String? message]) => ApiException(
        message ?? 'Cannot reach the server. Check your connection and try again.',
        code: 'NETWORK',
      );

  factory ApiException.timeout() => const ApiException(
        'The request timed out. Please try again.',
        code: 'TIMEOUT',
      );

  @override
  String toString() => 'ApiException($code, $statusCode): $message';
}
