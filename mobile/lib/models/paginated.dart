import '../core/json.dart';

/// Generic paginated response wrapper.
class Paginated<T> {
  const Paginated({
    required this.items,
    required this.total,
    required this.page,
    required this.pageSize,
    required this.totalPages,
  });

  final List<T> items;
  final int total;
  final int page;
  final int pageSize;
  final int totalPages;

  bool get hasMore => page < totalPages;

  factory Paginated.fromJson(Map<String, dynamic> json, T Function(Map<String, dynamic>) itemFromJson) => Paginated<T>(
        items: asList(json['items']).map((e) => itemFromJson(asMap(e))).toList(),
        total: asInt(json['total']),
        page: asInt(json['page'], 1),
        pageSize: asInt(json['pageSize'], 20),
        totalPages: asInt(json['totalPages'], 1),
      );
}
