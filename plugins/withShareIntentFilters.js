// plugins/withShareIntentFilters.js
const { withAndroidManifest } = require('@expo/config-plugins');

function withShareIntentFilters(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;

    // If there's no application array, bail out
    if (!androidManifest.application || !androidManifest.application.length) {
      throw new Error('No <application> tag in AndroidManifest');
    }

    // We assume the first <application> is your main one
    const mainApplication = androidManifest.application[0];

    // Ensure <activity> list exists
    if (!mainApplication.activity || !mainApplication.activity.length) {
      throw new Error('No <activity> tag in <application> of AndroidManifest');
    }

    // Typically the first <activity> is MainActivity
    const mainActivity = mainApplication.activity[0];

    // If there's no existing intent-filters array, create it
    if (!mainActivity['intent-filter']) {
      mainActivity['intent-filter'] = [];
    }

    // Helper to add an intent-filter
    function addIntentFilter({ actionName, mimeType }) {
      mainActivity['intent-filter'].push({
        action: [
          {
            $: {
              'android:name': actionName
            }
          }
        ],
        category: [
          {
            $: {
              'android:name': 'android.intent.category.DEFAULT'
            }
          }
        ],
        data: [
          {
            $: {
              'android:mimeType': mimeType
            }
          }
        ]
      });
    }

    // Add SEND (single text file)
    addIntentFilter({
      actionName: 'android.intent.action.SEND',
      mimeType: 'text/plain',
    });

    // Add SEND_MULTIPLE (multiple text files)
    addIntentFilter({
      actionName: 'android.intent.action.SEND_MULTIPLE',
      mimeType: 'text/plain',
    });

    addIntentFilter({
        actionName: 'android.intent.action.SEND',
        mimeType: 'application/zip',
      });
      
      // “SEND_MULTIPLE” multiple zips
      addIntentFilter({
        actionName: 'android.intent.action.SEND_MULTIPLE',
        mimeType: 'application/zip',
      });

    return config;
  });
}

module.exports = withShareIntentFilters;
