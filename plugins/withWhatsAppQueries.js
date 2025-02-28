// plugins/withWhatsAppQueries.js

const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withWhatsAppQueries(config) {
  return withAndroidManifest(config, (config) => {
    if (!config.modResults.manifest.queries) {
      config.modResults.manifest.queries = [];
    }

    const existingQueries = config.modResults.manifest.queries;

    function addPackageQuery(packageName) {
      // Only add if an entry with android:name="packageName" does not already exist
      const alreadyExists = existingQueries.some(
        (q) => q.package?.[0]?.$?.['android:name'] === packageName
      );

      if (!alreadyExists) {
        existingQueries.push({
          package: [
            {
              $: {
                'android:name': packageName,
              },
            },
          ],
        });
      }
    }

    addPackageQuery('com.whatsapp');
    addPackageQuery('com.whatsapp.w4b');

    config.modResults.manifest.queries = existingQueries;
    return config;
  });
};
