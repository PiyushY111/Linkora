/**
 * Saves a Blob (e.g. a CSV export fetched with responseType 'blob') as a
 * file download.
 * @param {Blob | BlobPart} data
 * @param {string} filename
 */
export function downloadBlob(data, filename) {
  const url = window.URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.parentNode.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export default downloadBlob;
