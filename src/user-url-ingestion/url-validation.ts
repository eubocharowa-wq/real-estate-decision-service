import { isIP } from "node:net";

import { USER_URL_INGESTION_POLICY_V1 } from "./policy";
import type { UserUrlValidationOutcome } from "./types";

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.internal",
]);

const isPrivateIpv4 = (hostname: string): boolean => {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
};

const isPrivateIpv6 = (hostname: string): boolean => {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(value)) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
};

export const isBlockedNetworkHostname = (hostname: string): boolean => {
  const value = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  if (
    blockedHostnames.has(value) ||
    value.endsWith(".localhost") ||
    value.endsWith(".local") ||
    value.endsWith(".internal")
  )
    return true;
  const kind = isIP(value);
  return kind === 4
    ? isPrivateIpv4(value)
    : kind === 6
      ? isPrivateIpv6(value)
      : false;
};

const removeTrackingParameters = (url: URL): void => {
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (
      USER_URL_INGESTION_POLICY_V1.removableTrackingParameters.includes(
        lower as never,
      ) ||
      USER_URL_INGESTION_POLICY_V1.removableTrackingPrefixes.some((prefix) =>
        lower.startsWith(prefix),
      )
    )
      url.searchParams.delete(key);
  }
};

export const validateUserUrl = (input: string): UserUrlValidationOutcome => {
  const originalUrl = input.trim();
  if (
    originalUrl.length === 0 ||
    originalUrl.length > USER_URL_INGESTION_POLICY_V1.maximumUrlLength
  )
    return {
      success: false,
      error: {
        code: "INVALID_URL",
        message: "Проверьте длину и формат ссылки.",
      },
    };
  let url: URL;
  try {
    url = new URL(originalUrl);
  } catch {
    return {
      success: false,
      error: {
        code: "INVALID_URL",
        message: "Введите полную ссылку на объект.",
      },
    };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return {
      success: false,
      error: {
        code: "UNSUPPORTED_PROTOCOL",
        message: "Поддерживаются только ссылки http и https.",
      },
    };
  if (url.username || url.password || !url.hostname)
    return {
      success: false,
      error: {
        code: "INVALID_URL",
        message: "Ссылка содержит недопустимые данные доступа.",
      },
    };
  if (isBlockedNetworkHostname(url.hostname))
    return {
      success: false,
      error: {
        code: "PRIVATE_NETWORK_BLOCKED",
        message: "Ссылки на локальные и служебные сети запрещены.",
      },
    };
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  )
    url.port = "";
  removeTrackingParameters(url);
  return {
    success: true,
    value: {
      originalUrl,
      canonicalUrl: url.toString(),
      protocol: url.protocol as "http:" | "https:",
      hostname: url.hostname,
      pathname: url.pathname,
    },
  };
};
