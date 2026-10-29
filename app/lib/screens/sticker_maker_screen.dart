import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../models/category.dart';
import '../services/api_service.dart';
import '../sticker_studio/sticker_generator.dart';

class StickerMakerScreen extends StatefulWidget {
  final ApiService apiService;
  final List<GearCategory> categories;

  const StickerMakerScreen({
    super.key,
    required this.apiService,
    required this.categories,
  });

  @override
  State<StickerMakerScreen> createState() => _StickerMakerScreenState();
}

class _StickerMakerScreenState extends State<StickerMakerScreen> {
  final _picker = ImagePicker();
  final _formKey = GlobalKey<FormState>();

  File? _selectedImageFile;
  File? _generatedStickerFile;
  bool _isProcessingSticker = false;
  bool _isSubmitting = false;

  String? _categoryId;
  String _name = '';
  String? _brand;
  String? _model;
  double _weightGrams = 0;
  String? _description;
  double _borderThickness = 14.0;

  @override
  void initState() {
    super.initState();
    if (widget.categories.isNotEmpty) {
      _categoryId = widget.categories.first.id;
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    final picked = await _picker.pickImage(source: source, maxWidth: 1200, maxHeight: 1200);
    if (picked == null) return;

    setState(() {
      _selectedImageFile = File(picked.path);
      _isProcessingSticker = true;
    });

    try {
      final bytes = await _selectedImageFile!.readAsBytes();
      final stickerBytes = await StickerGenerator.generateSticker(
        inputBytes: bytes,
        borderThickness: _borderThickness.round(),
      );

      final tempPath = '${_selectedImageFile!.parent.path}/sticker_${DateTime.now().millisecondsSinceEpoch}.png';
      final stickerFile = await StickerGenerator.saveStickerToFile(stickerBytes, tempPath);

      setState(() {
        _generatedStickerFile = stickerFile;
        _isProcessingSticker = false;
      });
    } catch (e) {
      setState(() => _isProcessingSticker = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('贴纸生成失败: $e')),
        );
      }
    }
  }

  Future<void> _saveGear() async {
    if (!_formKey.currentState!.validate()) return;
    _formKey.currentState!.save();

    setState(() => _isSubmitting = true);

    try {
      String? stickerUrl;
      String? originalUrl;

      // 上传贴纸至 Cloudflare R2
      if (_generatedStickerFile != null) {
        stickerUrl = await widget.apiService.uploadImage(_generatedStickerFile!, type: 'gear_sticker');
      }
      if (_selectedImageFile != null) {
        originalUrl = await widget.apiService.uploadImage(_selectedImageFile!, type: 'gear_original');
      }

      await widget.apiService.createGear(
        categoryId: _categoryId!,
        name: _name,
        brand: _brand,
        model: _model,
        weightGrams: _weightGrams,
        description: _description,
        stickerImageUrl: stickerUrl,
        originalImageUrl: originalUrl,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('🎉 装备贴纸已保存到装备柜！')),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      setState(() => _isSubmitting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('保存失败: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9F9FB),
      appBar: _generatedStickerFile == null
          ? null
          : AppBar(
              title: const Text('完善装备贴纸', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              backgroundColor: Colors.white,
              elevation: 0.5,
            ),
      body: _generatedStickerFile == null
          ? Container(
              color: const Color(0xFF0F0E0C),
              child: SafeArea(
                child: Column(
                  children: [
                    // 顶部取景提示
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.close, color: Colors.white),
                            onPressed: () => Navigator.pop(context),
                          ),
                          const Row(
                            children: [
                              Icon(Icons.lens, size: 8, color: Colors.redAccent),
                              SizedBox(width: 6),
                              Text(
                                '取景框对准装备主体',
                                style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                          const SizedBox(width: 48),
                        ],
                      ),
                    ),

                    // 中间相机取景大画幅
                    Expanded(
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E1D1A),
                          borderRadius: BorderRadius.circular(28),
                          border: Border.all(color: Colors.white.withOpacity(0.15)),
                        ),
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            if (_isProcessingSticker)
                              const Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  CircularProgressIndicator(color: Colors.white),
                                  SizedBox(height: 12),
                                  Text('正在生成白色描边贴纸...', style: TextStyle(color: Colors.white70, fontSize: 13)),
                                ],
                              )
                            else
                              Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 72,
                                    height: 72,
                                    decoration: BoxDecoration(
                                      color: Colors.white.withOpacity(0.08),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(Icons.camera_alt, size: 36, color: Colors.amber),
                                  ),
                                  const SizedBox(height: 14),
                                  const Text(
                                    '点击下方快门拍照',
                                    style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '自动智能抠图并生成白色描边贴纸',
                                    style: TextStyle(color: Colors.grey[400], fontSize: 12),
                                  ),
                                ],
                              ),
                          ],
                        ),
                      ),
                    ),

                    // 底部快门操作栏
                    Padding(
                      padding: const EdgeInsets.fromLTRB(36, 16, 36, 32),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          // 相册选图
                          GestureDetector(
                            onTap: () => _pickImage(ImageSource.gallery),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 48,
                                  height: 48,
                                  decoration: BoxDecoration(
                                    color: Colors.white.withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(16),
                                    border: Border.all(color: Colors.white.withOpacity(0.2)),
                                  ),
                                  child: const Icon(Icons.photo_library, color: Colors.white, size: 22),
                                ),
                                const SizedBox(height: 6),
                                const Text('相册选图', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
                              ],
                            ),
                          ),

                          // 核心大快门按钮
                          GestureDetector(
                            onTap: () => _pickImage(ImageSource.camera),
                            child: Container(
                              width: 80,
                              height: 80,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 4),
                              ),
                              padding: const EdgeInsets.all(4),
                              child: Container(
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),

                          // 占位保对称
                          const SizedBox(width: 48),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // 贴纸已生成预览区
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('✨ 贴纸已生成', style: TextStyle(fontWeight: FontWeight.black, fontSize: 16)),
                        TextButton.icon(
                          onPressed: () => setState(() => _generatedStickerFile = null),
                          icon: const Icon(Icons.refresh, size: 16),
                          label: const Text('重拍'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    Container(
                      height: 180,
                      decoration: BoxDecoration(
                        color: const Color(0xFFF6F2EA),
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(color: const Color(0xFFD5D0C3), width: 1.5),
                      ),
                      child: Center(
                        child: Image.file(_generatedStickerFile!, fit: BoxFit.contain),
                      ),
                    ),

                    const SizedBox(height: 20),

              // 装备表单信息 (极简 4 字段)
              TextFormField(
                decoration: const InputDecoration(
                  labelText: '装备名称 *',
                  hintText: '如：胡巴 双人帐篷',
                  filled: true,
                  fillColor: Colors.white,
                ),
                validator: (v) => (v == null || v.trim().isEmpty) ? '请输入装备名称' : null,
                onSaved: (v) => _name = v?.trim() ?? '',
              ),

              const SizedBox(height: 14),

              // 重量与品牌
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      decoration: const InputDecoration(
                        labelText: '重量 (克 g) *',
                        hintText: '如：1350',
                        filled: true,
                        fillColor: Colors.white,
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: (v) => (v == null || double.tryParse(v) == null) ? '请输入有效重量' : null,
                      onSaved: (v) => _weightGrams = double.tryParse(v ?? '0') ?? 0,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      decoration: const InputDecoration(
                        labelText: '品牌 (选填)',
                        hintText: '如：MSR',
                        filled: true,
                        fillColor: Colors.white,
                      ),
                      onSaved: (v) => _brand = v?.trim(),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 14),

              TextFormField(
                decoration: const InputDecoration(
                  labelText: '备注 (选填)',
                  hintText: '如：防风抗暴雨、三人四季温带使用',
                  filled: true,
                  fillColor: Colors.white,
                ),
                maxLines: 2,
                onSaved: (v) => _description = v?.trim(),
              ),

              const SizedBox(height: 28),

              ElevatedButton(
                onPressed: _isSubmitting ? null : _saveGear,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1A382B),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: _isSubmitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : const Text(
                        '✨ 生成贴纸并掉落到首页',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
              ),
                ),
                child: _isSubmitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : const Text(
                        '保存到装备柜',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class TextInputValue extends TextInputType {
  const TextInputValue({super.signed, super.decimal}) : super.numberWithOptions();
}
