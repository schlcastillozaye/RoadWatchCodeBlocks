import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/api_exception.dart';
import '../../core/format.dart';
import '../../models/models.dart';
import '../../state/reports_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/app_button.dart';
import '../../widgets/section_card.dart';
import 'location_picker_screen.dart';

class _PickedPhoto {
  _PickedPhoto({required this.name, required this.bytes, required this.size});

  final String name;
  final Uint8List bytes;
  final int size;
}

class SubmitReportScreen extends StatefulWidget {
  const SubmitReportScreen({super.key});

  @override
  State<SubmitReportScreen> createState() => _SubmitReportScreenState();
}

class _SubmitReportScreenState extends State<SubmitReportScreen> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _categoryOther = TextEditingController();
  final _address = TextEditingController();
  final _picker = ImagePicker();

  IssueCategory _category = IssueCategory.pothole;
  Priority _priority = Priority.medium;
  final List<_PickedPhoto> _photos = [];

  PickedLocation? _location;

  bool _submitting = false;
  double? _progress;

  static const int _maxPhotos = 5;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _categoryOther.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _addPhoto(ImageSource source) async {
    if (_photos.length >= _maxPhotos) {
      _snack('You can attach up to $_maxPhotos photos.');
      return;
    }
    try {
      final file = await _picker.pickImage(
        source: source,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 82,
      );
      if (file == null) return;
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      setState(() {
        _photos.add(_PickedPhoto(
          name: file.name.isNotEmpty ? file.name : 'photo_${_photos.length + 1}.jpg',
          bytes: bytes,
          size: bytes.length,
        ));
      });
    } catch (_) {
      if (mounted) _snack('Could not read the selected image. Please try another.');
    }
  }

  Future<void> _pickLocation() async {
    final result = await Navigator.of(context).push<PickedLocation>(
      MaterialPageRoute(
        builder: (_) => LocationPickerScreen(
          initialLatitude: _location?.latitude,
          initialLongitude: _location?.longitude,
        ),
      ),
    );
    if (result != null && mounted) {
      setState(() {
        _location = result;
        if (result.address != null && result.address!.isNotEmpty) {
          _address.text = result.address!;
        }
      });
    }
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_photos.isEmpty) {
      _snack('Attach at least one photo of the issue.');
      return;
    }
    if (_location == null) {
      _snack('Choose the location of the issue.');
      return;
    }

    FocusScope.of(context).unfocus();
    setState(() {
      _submitting = true;
      _progress = 0;
    });

    try {
      final report = await context.read<MyReportsProvider>().submit(
            title: _title.text.trim(),
            description: _description.text.trim(),
            category: _category,
            categoryOther: _category == IssueCategory.other ? _categoryOther.text.trim() : null,
            priority: _priority,
            latitude: _location!.latitude,
            longitude: _location!.longitude,
            addressText: _address.text.trim().isEmpty ? _location!.address : _address.text.trim(),
            areaLabel: _location!.areaLabel,
            photos: [
              for (final photo in _photos)
                UploadFile(field: 'photos', bytes: photo.bytes, filename: photo.name),
            ],
            onProgress: (sent, total) {
              if (!mounted || total <= 0) return;
              setState(() => _progress = (sent / total).clamp(0.0, 1.0));
            },
          );

      if (!mounted) return;
      setState(() => _progress = 1);
      await _showSuccess(report);
    } on ApiException catch (e) {
      if (mounted) _snack(e.message);
    } catch (_) {
      if (mounted) _snack('Could not submit your report. Please check your connection and try again.');
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
          _progress = null;
        });
      }
    }
  }

  Future<void> _showSuccess(RoadReport report) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(color: AppColors.tintGreen, borderRadius: BorderRadius.circular(24)),
              child: Icon(Icons.check_rounded, size: 38, color: AppColors.statusGreenInk),
            ),
            const SizedBox(height: 18),
            Text('Report submitted', style: AppTypography.display(size: 22), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              'Your report is now pending review by the administrator.',
              textAlign: TextAlign.center,
              style: AppTypography.bodyStyle(size: 14, color: AppColors.textMuted),
            ),
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
              decoration: BoxDecoration(color: AppColors.lightYellow, borderRadius: BorderRadius.circular(14)),
              child: Column(
                children: [
                  Text('Reference number', style: AppTypography.caption(size: 11.5)),
                  const SizedBox(height: 2),
                  Text(report.referenceNo, style: AppTypography.headingStyle(size: 18)),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Done'),
          ),
        ],
      ),
    );
    if (mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return Scaffold(
      backgroundColor: AppColors.sheetBackground,
      appBar: AppBar(title: const Text('Report an issue')),
      body: AbsorbPointer(
        absorbing: _submitting,
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              SectionCard(
                title: 'What is the issue?',
                child: Column(
                  children: [
                    TextFormField(
                      controller: _title,
                      textCapitalization: TextCapitalization.sentences,
                      maxLength: 120,
                      decoration: const InputDecoration(
                        labelText: 'Short title',
                        hintText: 'e.g. Deep pothole near barangay hall',
                        counterText: '',
                      ),
                      validator: (v) {
                        final value = v?.trim() ?? '';
                        if (value.length < 5) return 'Give a short title (at least 5 characters).';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _description,
                      textCapitalization: TextCapitalization.sentences,
                      minLines: 3,
                      maxLines: 6,
                      maxLength: 1000,
                      decoration: const InputDecoration(
                        labelText: 'Description',
                        hintText: 'Describe the issue, how big it is and any safety risk.',
                        alignLabelWithHint: true,
                      ),
                      validator: (v) {
                        final value = v?.trim() ?? '';
                        if (value.length < 10) return 'Please describe the issue (at least 10 characters).';
                        return null;
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SectionCard(
                title: 'Category',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final category in IssueCategory.selectable)
                          ChoiceChip(
                            selected: _category == category,
                            onSelected: (_) => setState(() => _category = category),
                            avatar: Icon(
                              category.icon,
                              size: 16,
                              color: _category == category ? AppColors.onPrimary : AppColors.darkBlue,
                            ),
                            label: Text(category.label),
                          ),
                      ],
                    ),
                    // "Other" is only meaningful with an explanation, so the
                    // field appears (and is required) only for that category.
                    if (_category == IssueCategory.other) ...[
                      const SizedBox(height: 14),
                      TextFormField(
                        key: const Key('category-other-field'),
                        controller: _categoryOther,
                        textCapitalization: TextCapitalization.sentences,
                        maxLength: IssueCategory.otherDescriptionMax,
                        decoration: const InputDecoration(
                          labelText: 'Describe the issue',
                          hintText: 'e.g. Fallen tree blocking the whole lane',
                        ),
                        validator: (v) {
                          if (_category != IssueCategory.other) return null;
                          final value = v?.trim() ?? '';
                          if (value.length < IssueCategory.otherDescriptionMin) {
                            return 'Please describe the issue (at least ${IssueCategory.otherDescriptionMin} characters).';
                          }
                          return null;
                        },
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SectionCard(
                title: 'Priority',
                child: Wrap(
                  spacing: 8,
                  children: [
                    for (final priority in Priority.values)
                      ChoiceChip(
                        selected: _priority == priority,
                        onSelected: (_) => setState(() => _priority = priority),
                        label: Text(priority.label),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SectionCard(
                title: 'Photos',
                trailing: Text('${_photos.length}/$_maxPhotos', style: AppTypography.caption(size: 12)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Add clear photos of the road issue. At least one is required.',
                      style: AppTypography.caption(size: 12.5),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        for (var i = 0; i < _photos.length; i++)
                          _PhotoTile(
                            photo: _photos[i],
                            onRemove: () => setState(() => _photos.removeAt(i)),
                          ),
                        if (_photos.length < _maxPhotos)
                          _AddPhotoTile(
                            onCamera: () => _addPhoto(ImageSource.camera),
                            onGallery: () => _addPhoto(ImageSource.gallery),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SectionCard(
                title: 'Location',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_location == null)
                      Text(
                        'Confirm where the issue is so the maintenance team can find it.',
                        style: AppTypography.caption(size: 12.5),
                      ),
                    if (_location != null) ...[
                      Row(
                        children: [
                          Icon(Icons.place_rounded, size: 18, color: AppColors.brandAccent),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              formatCoords(_location!.latitude, _location!.longitude),
                              style: AppTypography.bodyStyle(size: 14, weight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 12),
                    AppButton(
                      label: _location == null ? 'Pick location on map' : 'Change location',
                      variant: AppButtonVariant.secondary,
                      icon: Icons.pin_drop_rounded,
                      onPressed: _pickLocation,
                    ),
                    if (_location != null) ...[
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _address,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(
                          labelText: 'Landmark / address (optional)',
                          hintText: 'e.g. In front of Barangay San Jose hall',
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 22),
              if (_submitting && _progress != null) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: _progress,
                    minHeight: 8,
                    backgroundColor: AppColors.lightAzure,
                    valueColor: AlwaysStoppedAnimation(AppColors.darkBlue),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Uploading… ${((_progress ?? 0) * 100).toStringAsFixed(0)}%',
                  style: AppTypography.caption(size: 12),
                ),
                const SizedBox(height: 12),
              ],
              AppButton(
                label: 'Submit report',
                icon: Icons.send_rounded,
                loading: _submitting,
                onPressed: _submitting ? null : _submit,
              ),
              const SizedBox(height: 10),
              Text(
                'Reports go to the administrator for review before appearing on the public map.',
                textAlign: TextAlign.center,
                style: AppTypography.caption(size: 11.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PhotoTile extends StatelessWidget {
  const _PhotoTile({required this.photo, required this.onRemove});

  final _PickedPhoto photo;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return Stack(
      clipBehavior: Clip.none,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Image.memory(photo.bytes, width: 96, height: 96, fit: BoxFit.cover),
        ),
        Positioned(
          top: -6,
          right: -6,
          child: GestureDetector(
            onTap: onRemove,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: AppColors.statusRed, shape: BoxShape.circle),
              // `statusRed` is a light red in dark mode, so the glyph must darken
              // rather than stay white.
              child: Icon(
                Icons.close_rounded,
                size: 14,
                color: AppColors.isDark ? AppColors.darkBlue : AppColors.white,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _AddPhotoTile extends StatelessWidget {
  const _AddPhotoTile({required this.onCamera, required this.onGallery});

  final VoidCallback onCamera;
  final VoidCallback onGallery;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return PopupMenuButton<String>(
      onSelected: (value) => value == 'camera' ? onCamera() : onGallery(),
      position: PopupMenuPosition.under,
      itemBuilder: (context) => const [
        PopupMenuItem(value: 'camera', child: ListTile(leading: Icon(Icons.camera_alt_rounded), title: Text('Take a photo'))),
        PopupMenuItem(value: 'gallery', child: ListTile(leading: Icon(Icons.photo_library_rounded), title: Text('Choose from gallery'))),
      ],
      child: Container(
        width: 96,
        height: 96,
        decoration: BoxDecoration(
          color: AppColors.sheetBackground,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.lightAzure),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.add_a_photo_rounded, color: AppColors.brandAccent, size: 22),
            const SizedBox(height: 4),
            Text('Add', style: AppTypography.caption(size: 11.5, weight: FontWeight.w600, color: AppColors.brandAccent)),
          ],
        ),
      ),
    );
  }
}
