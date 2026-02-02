const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
require("dotenv").config();

const OBS_CONFIG = {
  accessKey: process.env.OBS_ACCESS_KEY,
  secretKey: process.env.OBS_SECRET_KEY,
  endpoint: process.env.OBS_ENDPOINT,
  bucketName: process.env.OBS_BUCKET_NAME,
};

// ------------------------------
// ACL Types
// ------------------------------
const ACL_TYPES = {
  PRIVATE: "private",
  PUBLIC_READ: "public-read",
  PUBLIC_READ_WRITE: "public-read-write",
  AUTHENTICATED_READ: "authenticated-read",
};

// ------------------------------
// Helpers
// ------------------------------
function calculateContentMD5(data) {
  if (!data) return "";
  const md5 = crypto.createHash("md5");
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  md5.update(buffer);
  return md5.digest("base64");
}

function buildCanonicalizedHeaders(headers) {
  const obsHeaders = Object.entries(headers)
    .filter(([key]) => key.toLowerCase().startsWith("x-obs-"))
    .map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value.join(",") : value.trim(),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
  return (
    obsHeaders.map(([key, value]) => `${key}:${value}`).join("\n") +
    (obsHeaders.length ? "\n" : "")
  );
}

function getAuthorizationSignature(method, headers = {}, objectKey = "") {
  const now = new Date().toUTCString();

  let canonicalizedResource = `/${OBS_CONFIG.bucketName}`;
  if (objectKey)
    canonicalizedResource += `/${encodeURIComponent(
      objectKey.startsWith("/") ? objectKey.slice(1) : objectKey
    )}`;

  const stringToSign = `${method}\n${headers["Content-MD5"] || ""}\n${
    headers["Content-Type"] || ""
  }\n${now}\n${buildCanonicalizedHeaders(headers)}${canonicalizedResource}`;

  const hmac = crypto.createHmac("sha1", OBS_CONFIG.secretKey);
  hmac.update(stringToSign, "utf8");
  const signature = hmac.digest("base64");

  return {
    signature,
    date: now,
    authorization: `OBS ${OBS_CONFIG.accessKey}:${signature}`,
  };
}

async function makeOBSRequest(
  method,
  objectKey = "",
  data = null,
  contentType = "application/octet-stream",
  acl = ACL_TYPES.PUBLIC_READ
) {
  const contentMD5 = data ? calculateContentMD5(data) : "";
  const headers = {
    "Content-Type": contentType,
    "Content-MD5": contentMD5,
  };
  if (acl) headers["x-obs-acl"] = acl;

  const auth = getAuthorizationSignature(method, headers, objectKey);

  const url = `${OBS_CONFIG.endpoint}/${
    objectKey ? encodeURIComponent(objectKey) : ""
  }`;

  const response = await axios({
    method,
    url,
    headers: {
      ...headers,
      Host: new URL(OBS_CONFIG.endpoint).host,
      Date: auth.date,
      Authorization: auth.authorization,
      "Content-Length": data ? data.length : 0,
    },
    data,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    responseType: "json",
  });
  console.log(response?.data);
  return {
    statusCode: response.status,
    body: response.data,
    objectKey,
    acl,
    url: `${OBS_CONFIG.endpoint}/${objectKey}`,
  };
}

// ------------------------------
// Public Functions
// ------------------------------

// Upload a single file (buffer or file path) with optional folder
async function uploadFile({
  buffer = null,
  filePath = null,
  objectKey,
  folder = "",
  contentType = "application/octet-stream",
  acl = ACL_TYPES.PRIVATE,
}) {
  if (!buffer && !filePath)
    throw new Error("Either buffer or filePath must be provided");

  const data = buffer || fs.readFileSync(filePath);
  if (!objectKey) objectKey = path.basename(filePath || `file-${Date.now()}`);

  // Clean folder name and prepend to objectKey
  if (folder) {
    folder = folder.replace(/^\/+|\/+$/g, ""); // remove leading/trailing slashes
    objectKey = `${folder}/${objectKey}`;
  }

  return makeOBSRequest("PUT", objectKey, data, contentType, acl);
}

// Upload multiple files
async function uploadFiles(files = []) {
  if (!Array.isArray(files)) throw new Error("Files must be an array");
  const results = [];
  for (const file of files) {
    const result = await uploadFile(file);
    results.push(result);
  }
  return results;
}

// Check if a file is public
async function checkFilePublic(objectKey) {
  try {
    const url = `${OBS_CONFIG.endpoint}/${
      OBS_CONFIG.bucketName
    }/${encodeURIComponent(objectKey)}`;
    const res = await axios.head(url, { timeout: 5000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

module.exports = {
  ACL_TYPES,
  uploadFile,
  uploadFiles,
  checkFilePublic,
};
