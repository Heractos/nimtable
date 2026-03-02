/*
 * Copyright 2026 Nimtable
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Last segment of a namespace path for display (e.g. "a.b.c" → "c"). */
export function namespaceShortName(namespace: string): string {
  if (namespace == null || typeof namespace !== "string") return ""
  const parts = namespace.split(".").filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : namespace
}

interface IcebergErrorResponse {
  error: {
    message: string
  }
}

export function errorToString(error: unknown): string {
  if (typeof error === "string") {
    return error
  }
  // Nimtable backend error shape (generated as `_Error`)
  // { code: string; message: string; details?: string }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message
    const detailsRaw =
      "details" in error &&
      typeof (error as { details?: unknown }).details === "string"
        ? (error as { details: string }).details
        : ""

    // Avoid dumping HTML into UI toasts, and keep details short.
    const details = (() => {
      if (!detailsRaw) return ""
      const looksLikeHtml = /<!doctype|<html[\s>]|<\/(head|body|html)>/i.test(
        detailsRaw
      )
      if (looksLikeHtml) return ""
      const singleLine = detailsRaw.replace(/\s+/g, " ").trim()
      if (singleLine.length <= 140) return singleLine
      return `${singleLine.slice(0, 140)}…`
    })()

    return details ? `${message} (${details})` : message
  }
  // API response body shape { error: string } (e.g. login 403/500)
  if (
    error &&
    typeof error === "object" &&
    "error" in error &&
    typeof (error as { error?: unknown }).error === "string"
  ) {
    return (error as { error: string }).error
  }
  // IcebergErrorResponse
  if (
    error &&
    typeof error === "object" &&
    "error" in error &&
    error.error &&
    typeof error.error === "object" &&
    "message" in error.error &&
    typeof error.error.message === "string"
  ) {
    return (error as IcebergErrorResponse).error.message
  }
  // Error
  if (error instanceof Error) {
    return error.message
  }
  // Nested body/data (e.g. some HTTP clients attach parsed body to thrown error)
  if (error && typeof error === "object") {
    const body = "body" in error ? (error as { body?: unknown }).body : null
    const data = "data" in error ? (error as { data?: unknown }).data : null
    const nested = body ?? data
    if (
      nested &&
      typeof nested === "object" &&
      "error" in nested &&
      typeof (nested as { error?: unknown }).error === "string"
    ) {
      return (nested as { error: string }).error
    }
  }
  // Fallback
  return "Unknown error"
}
