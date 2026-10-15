/// Process-wide holder for the current access token so image widgets can add
/// the Authorization header synchronously (cached_network_image needs it at
/// build time). Updated by [TokenStore]; never persisted here.
class SessionTokens {
  SessionTokens._();

  static String? accessToken;

  static Map<String, String> authHeaders({bool isPublic = false}) {
    if (isPublic) return const {};
    final token = accessToken;
    return token == null ? const {} : {'Authorization': 'Bearer $token'};
  }
}
