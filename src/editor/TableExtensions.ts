import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';

export const DocumentTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      autoFit: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-auto-fit'),
        renderHTML: (attributes) =>
          attributes.autoFit ? { 'data-auto-fit': attributes.autoFit } : {},
      },
    };
  },
});

const styledCellAttributes = {
  style: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('style'),
    renderHTML: (attributes: { style?: string | null }) =>
      attributes.style ? { style: attributes.style } : {},
  },
};

export const DocumentTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...styledCellAttributes,
    };
  },
});

export const DocumentTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...styledCellAttributes,
    };
  },
});
