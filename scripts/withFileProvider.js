const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * FileProvider config plugin
 * Her prebuild'de AndroidManifest'e FileProvider ekler ve file_paths.xml oluşturur
 */
const withFileProvider = (config) => {
  // AndroidManifest.xml'e FileProvider ekle
  config = withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const application = androidManifest.manifest.application[0];

    // FileProvider zaten var mı kontrol et
    const providers = application.provider || [];
    const hasFileProvider = providers.some(
      (provider) =>
        provider.$?.['android:name'] === 'androidx.core.content.FileProvider'
    );

    if (!hasFileProvider) {
      // FileProvider ekle
      if (!application.provider) {
        application.provider = [];
      }

      application.provider.push({
        $: {
          'android:name': 'androidx.core.content.FileProvider',
          'android:authorities': '${applicationId}.fileprovider',
          'android:exported': 'false',
          'android:grantUriPermissions': 'true',
        },
        'meta-data': [
          {
            $: {
              'android:name': 'android.support.FILE_PROVIDER_PATHS',
              'android:resource': '@xml/file_paths',
            },
          },
        ],
      });

      console.log('✅ FileProvider added to AndroidManifest.xml');
    } else {
      console.log('ℹ️  FileProvider already exists in AndroidManifest.xml');
    }

    return config;
  });

  // file_paths.xml oluştur
  config = withAndroidManifest(config, async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const xmlDir = path.join(
      projectRoot,
      'android',
      'app',
      'src',
      'main',
      'res',
      'xml'
    );
    const xmlPath = path.join(xmlDir, 'file_paths.xml');

    // xml klasörü yoksa oluştur
    if (!fs.existsSync(xmlDir)) {
      fs.mkdirSync(xmlDir, { recursive: true });
      console.log('✅ Created xml directory');
    }

    // file_paths.xml içeriği
    const filePathsXml = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Downloads klasörü için -->
    <external-path name="external_files" path="Download/"/>
    
    <!-- External media klasörü (Android/media/...) -->
    <external-media-path name="external_media" path="."/>

    <!-- Tüm external storage -->
    <external-path name="external" path="."/>
    
    <!-- Cache klasörü -->
    <cache-path name="cache" path="."/>
    
    <!-- Internal files -->
    <files-path name="files" path="."/>
</paths>
`;

    // Dosyayı yaz
    fs.writeFileSync(xmlPath, filePathsXml);
    console.log('✅ Created file_paths.xml');

    return config;
  });

  return config;
};

module.exports = withFileProvider;
