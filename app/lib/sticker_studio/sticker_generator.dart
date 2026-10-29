import 'dart:io';
import 'dart:typed_data';
import 'package:image/image.dart' as img;

/// 贴纸工坊核心算法：为透明背景图像生成圆润的白色贴纸描边与柔和微投影
class StickerGenerator {
  /// 生成白色贴纸效果
  /// [inputImage]: 已抠出主体、背景为透明的图片
  /// [borderThickness]: 白边描边厚度（默认 14px）
  /// [addShadow]: 是否添加轻微手账微投影（默认 true）
  static Future<Uint8List> generateSticker({
    required Uint8List inputBytes,
    int borderThickness = 14,
    bool addShadow = true,
  }) async {
    final original = img.decodeImage(inputBytes);
    if (original == null) {
      throw Exception('无法解析图片');
    }

    final int width = original.width;
    final int height = original.height;
    final int padding = borderThickness + (addShadow ? 8 : 2);

    // 创建稍大的画布以容纳白边与投影
    final int canvasWidth = width + padding * 2;
    final int canvasHeight = height + padding * 2;
    final canvas = img.Image(width: canvasWidth, height: canvasHeight, numChannels: 4);

    // 1. 提取原图 Alpha 通道
    final alphaMask = List<int>.filled(width * height, 0);
    for (int y = 0; y < height; y++) {
      for (int x = 0; x < width; x++) {
        final pixel = original.getPixel(x, y);
        alphaMask[y * width + x] = pixel.a.toInt();
      }
    }

    // 2. 形态学膨胀 (Dilation) 生成白边轮廓
    final radius = borderThickness;
    final radiusSq = radius * radius;
    final dilatedMask = List<int>.filled(canvasWidth * canvasHeight, 0);

    for (int y = 0; y < height; y++) {
      for (int x = 0; x < width; x++) {
        if (alphaMask[y * width + x] > 30) {
          final centerX = x + padding;
          final centerY = y + padding;

          // 局部圆形区域膨胀
          for (int dy = -radius; dy <= radius; dy++) {
            final targetY = centerY + dy;
            if (targetY < 0 || targetY >= canvasHeight) continue;

            for (int dx = -radius; dx <= radius; dx++) {
              final targetX = centerX + dx;
              if (targetX < 0 || targetX >= canvasWidth) continue;

              if (dx * dx + dy * dy <= radiusSq) {
                dilatedMask[targetY * canvasWidth + targetX] = 255;
              }
            }
          }
        }
      }
    }

    // 3. 绘制柔和阴影 (Drop Shadow)
    if (addShadow) {
      const shadowOffsetY = 4;
      const shadowAlpha = 35; // 约 14% 不透明度
      for (int y = 0; y < canvasHeight; y++) {
        final srcY = y - shadowOffsetY;
        if (srcY < 0 || srcY >= canvasHeight) continue;

        for (int x = 0; x < canvasWidth; x++) {
          if (dilatedMask[srcY * canvasWidth + x] > 0) {
            canvas.setPixelRgba(x, y, 0, 0, 0, shadowAlpha);
          }
        }
      }
    }

    // 4. 绘制白色描边层
    for (int y = 0; y < canvasHeight; y++) {
      for (int x = 0; x < canvasWidth; x++) {
        if (dilatedMask[y * canvasWidth + x] > 0) {
          // 白色贴纸底
          canvas.setPixelRgba(x, y, 255, 255, 255, 255);
        }
      }
    }

    // 5. 覆盖原图主体在正中心
    img.compositeImage(
      canvas,
      original,
      dstX: padding,
      dstY: padding,
    );

    return Uint8List.fromList(img.encodePng(canvas));
  }

  /// 保存贴纸至本地沙盒
  static Future<File> saveStickerToFile(Uint8List pngBytes, String filePath) async {
    final file = File(filePath);
    await file.writeAsBytes(pngBytes);
    return file;
  }
}
