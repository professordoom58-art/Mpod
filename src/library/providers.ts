/**
 * Providers, in the order the app should try them.
 * Android gets MediaStore first, then imported files. iOS gets imported only.
 */

import { androidMediaStore } from './androidMediaStore';
import { importedFiles } from './importedFiles';
import type { LibraryProvider } from './types';

export function getProviders(): LibraryProvider[] {
  const providers: LibraryProvider[] = [];
  if (androidMediaStore.isSupported()) providers.push(androidMediaStore);
  if (importedFiles.isSupported()) providers.push(importedFiles);
  return providers;
}

/** The provider the "Update Library" menu item should use. */
export function getPrimaryProvider(): LibraryProvider {
  return getProviders()[0] ?? importedFiles;
}

export { androidMediaStore, importedFiles };
