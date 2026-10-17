<?php

namespace RoadWatch\Support;

/**
 * Best-effort image dimension extraction using the bundled GD-free
 * `getimagesizefromstring`. Never throws — unreadable images simply yield no
 * dimensions and the upload still succeeds.
 */
class ImageMeta
{
    /** @return array{width:?int,height:?int} */
    public static function dimensions(string $buffer): array
    {
        if ($buffer === '') {
            return ['width' => null, 'height' => null];
        }
        try {
            $info = @getimagesizefromstring($buffer);
            if ($info === false) {
                return ['width' => null, 'height' => null];
            }
            $width = isset($info[0]) ? (int) $info[0] : null;
            $height = isset($info[1]) ? (int) $info[1] : null;
            return [
                'width' => $width && $width > 0 ? $width : null,
                'height' => $height && $height > 0 ? $height : null,
            ];
        } catch (\Throwable $e) {
            return ['width' => null, 'height' => null];
        }
    }
}
