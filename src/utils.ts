export const cleanPath = (path: string): string => {
  let cleaned = path;
  if (cleaned.startsWith("/public/")) {
    cleaned = cleaned.substring(8);
  } else if (cleaned.startsWith("public/")) {
    cleaned = cleaned.substring(7);
  }
  
  if (cleaned.startsWith("/")) {
    cleaned = cleaned.substring(1);
  }
  
  return cleaned;
};

export const resolveAssetUrl = (pathStr: string, version?: number): string => {
  if (!pathStr) return "";
  const cleaned = cleanPath(pathStr);
  const v = version !== undefined ? version : Date.now();
  // Point directly to Express API static files with a reactive version parameter for cache-busting!
  return `http://localhost:3005/public/${cleaned}?v=${v}`;
};
