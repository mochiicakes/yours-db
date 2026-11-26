// jsdom's Blob lacks text() and arrayBuffer(), which every current browser has.
// Import this in jsdom tests that read files.
function readAs<T>(blob: Blob, how: 'readAsText' | 'readAsArrayBuffer'): Promise<T> {
  return new Promise((done, fail) => {
    const reader = new FileReader()
    reader.onload = () => done(reader.result as T)
    reader.onerror = () => fail(reader.error)
    reader[how](blob)
  })
}

Blob.prototype.text ??= function (this: Blob) {
  return readAs<string>(this, 'readAsText')
}
Blob.prototype.arrayBuffer ??= function (this: Blob) {
  return readAs<ArrayBuffer>(this, 'readAsArrayBuffer')
}
