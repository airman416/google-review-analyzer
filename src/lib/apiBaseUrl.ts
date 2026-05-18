export function buildApiUrl(path: string, baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL): string {
  if (!baseUrl) {
    return path;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}
