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
      appBar: AppBar(
        title: const Text('✨ 贴纸工坊制作', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: Colors.white,
        elevation: 0.5,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 贴纸预览区
              Container(
                height: 220,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.grey.withOpacity(0.15)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.04),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: _isProcessingSticker
                    ? const Center(child: CircularProgressIndicator())
                    : _generatedStickerFile != null
                        ? Center(
                            child: Image.file(_generatedStickerFile!, fit: BoxFit.contain),
                          )
                        : Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.add_photo_alternate_outlined, size: 56, color: Colors.grey[400]),
                                const SizedBox(height: 10),
                                Text('请拍照或选择一张装备照片', style: TextStyle(color: Colors.grey[600], fontSize: 14)),
                              ],
                            ),
                          ),
              ),

              const SizedBox(height: 14),

              // 拍照与相册按钮
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _pickImage(ImageSource.camera),
                      icon: const Icon(Icons.camera_alt),
                      label: const Text('拍照'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _pickImage(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library),
                      label: const Text('从相册选'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // 装备表单信息
              TextFormField(
                decoration: const InputDecoration(
                  labelText: '装备名称 *',
                  hintText: '如：云尚2 超轻帐篷',
                  filled: true,
                  fillColor: Colors.white,
                ),
                validator: (v) => (v == null || v.trim().isEmpty) ? '请输入装备名称' : null,
                onSaved: (v) => _name = v?.trim() ?? '',
              ),

              const SizedBox(height: 14),

              // 分类选择
              DropdownButtonFormField<String>(
                value: _categoryId,
                decoration: const InputDecoration(
                  labelText: '装备分类 *',
                  filled: true,
                  fillColor: Colors.white,
                ),
                items: widget.categories.map((c) {
                  return DropdownMenuItem(value: c.id, child: Text(c.name));
                }).toList(),
                onChanged: (val) => setState(() => _categoryId = val),
              ),

              const SizedBox(height: 14),

              // 重量与品牌
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      decoration: const InputDecoration(
                        labelText: '重量 (克 g) *',
                        hintText: '如：1250',
                        filled: true,
                        fillColor: Colors.white,
                      ),
                      keyboardType: const TextInputValue(signed: false, decimal: true),
                      validator: (v) => (v == null || double.tryParse(v) == null) ? '请输入有效重量' : null,
                      onSaved: (v) => _weightGrams = double.tryParse(v ?? '0') ?? 0,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      decoration: const InputDecoration(
                        labelText: '品牌',
                        hintText: '如：Naturehike',
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
                  labelText: '型号',
                  hintText: '如：20D 硅胶款',
                  filled: true,
                  fillColor: Colors.white,
                ),
                onSaved: (v) => _model = v?.trim(),
              ),

              const SizedBox(height: 14),

              TextFormField(
                decoration: const InputDecoration(
                  labelText: '备注描述',
                  hintText: '补充描述、购入年份或注意事项',
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
                  backgroundColor: const Color(0xFF2E7D32),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
