// src/utils/uploadImages.js
import api from "../services/api";

/**
 * Upload a File to backend -> returns public URL
 * @param {File} file
 * @returns {Promise<string>} URL
 */
export async function uploadImage(file) {
  const fd = new FormData();
  fd.append("image", file); // field name must match router.single("image")

  // IMPORTANT: do NOT set Content-Type manually; the browser sets the proper multipart boundary
  const res = await api.post("/uploads/image", fd);
  if (!res.data?.url) throw new Error("Upload failed");
  return res.data.url;
}
