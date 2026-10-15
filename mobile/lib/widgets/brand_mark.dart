import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// The Code Blocks Inc. symbol, drawn in code so it stays crisp at any size:
/// a column of three rounded squares with two smaller accent squares beside
/// the top and bottom blocks — the middle-right slot is left empty, forming a
/// "C" out of blocks.
class CodeBlocksMark extends StatelessWidget {
  const CodeBlocksMark({super.key, this.size = 28, this.onDark = true});

  /// Height of a single main block.
  final double size;

  /// Dark background variant (light-blue blocks + light-yellow accents).
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final blockColor = onDark ? AppColors.lightBlue : AppColors.darkBlue;
    final accentColor = onDark ? AppColors.lightYellow : AppColors.lightAzure;
    final gap = size * 0.16;
    final radius = size * 0.32;
    final accent = size * 0.62;

    Widget block(double s, Color color) => Container(
          width: s,
          height: s,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(radius * (s / size))),
        );

    return SizedBox(
      width: size + gap + accent,
      height: size * 3 + gap * 2,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              block(size, blockColor),
              SizedBox(height: gap),
              block(size, blockColor),
              SizedBox(height: gap),
              block(size, blockColor),
            ],
          ),
          SizedBox(width: gap * 0.85),
          SizedBox(
            width: accent,
            height: size * 3 + gap * 2,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                block(accent, accentColor),
                // middle-right slot intentionally left empty
                block(accent, accentColor),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
