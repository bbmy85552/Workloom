export const FOLDER_CONTENT = '<div data-workloom-type="folder"></div>';

export function isFolderContent(contentJson: string | null | undefined) {
  const content = contentJson ?? '';
  // Existing documents retain their original marker until edited or migrated.
  return content.includes('data-workloom-type="folder"') || content.includes('data-jianji-type="folder"');
}
