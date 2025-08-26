// This file previously contained Firebase Admin SDK initialization
// and storage functions. These have been removed as the Storage
// feature requires a paid Firebase billing plan.

// No Firebase Admin SDK or storage-related code will be executed from this file.
// It effectively becomes a placeholder for Firebase functionalities that are no longer used.

// Ensure dotenv is still required if other parts of your application
// depend on environment variables, even if Firebase isn't initialized here.
require("dotenv").config(); 

// Export empty functions/objects as a fallback to prevent errors in main.js
// if it still tries to import these, but they won't perform any Firebase operations.
module.exports = {
  initializeFirebase: async () => {
    console.warn("Firebase initialization skipped: Storage feature removed due to billing plan.");
    // Return a mock bucket object if main.js expects it, to prevent crashes.
    return {
      upload: () => console.warn("Firebase upload skipped."),
      getFiles: async () => [[]], // Return an empty array of files
      download: () => console.warn("Firebase download skipped.")
    };
  },
  uploadFolder: async (folderPath, bucket) => {
    console.warn(`Firebase uploadFolder skipped for ${folderPath}: Storage feature removed.`);
  },
  downloadFolder: async (localFolder, bucket) => {
    console.warn(`Firebase downloadFolder skipped for ${localFolder}: Storage feature removed.`);
    // If local auth state is missing, main.js will proceed with fresh state.
    // If you were relying solely on Firebase for auth state and don't want to
    // start fresh, you'll need to manually manage the 'auth_info_baileys' folder.
  }
};
