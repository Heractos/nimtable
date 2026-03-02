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

import { NextRequest, NextResponse } from "next/server"
import { sign } from "jsonwebtoken"
import { compare, hash } from "bcryptjs"
import { db } from "@/lib/db"
import { LoginResponse } from "@/lib/acc-api/client/types.gen"
import { AUTH_COOKIE_NAME } from "../../const"

// Defaults so admin/admin works out of the box (e.g. when .env is not set)
const JWT_SECRET =
  process.env.JWT_SECRET || "dev-secret-change-in-production"
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      )
    }

    // Find user in database
    const user = await db.user.findUnique({
      where: { username },
      include: { roles: true },
    })

    if (user) {
      // Verify password
      const isValidPassword = await compare(password, user.password_hash)

      if (!isValidPassword) {
        return NextResponse.json(
          { error: "Invalid username or password" },
          { status: 403 }
        )
      }

      // Generate JWT token
      const token = sign(
        {
          id: user.id.toString(),
          username: user.username,
          role: user.roles.name,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      )

      // Create response with user data
      const response = NextResponse.json<LoginResponse>({
        success: true,
        token: token,
      })

      // Set cookie in response
      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: token,
        httpOnly: true,
        sameSite: "strict",
        maxAge: 60 * 60 * 24, // 24 hours
      })

      return response
    }

    // Check if superadmin user exists in database, if not create it
    let superAdminUser = await db.user.findFirst({
      where: { roles: { name: "superadmin" } },
      include: { roles: true },
    })

    if (!superAdminUser) {
      // Find superadmin role
      const superAdminRole = await db.role.findFirst({
        where: { name: "superadmin" },
      })

      if (!superAdminRole) {
        return NextResponse.json(
          { error: "Superadmin role not found in database" },
          { status: 500 }
        )
      }

      superAdminUser = await db.user.create({
        data: {
          username: ADMIN_USERNAME,
          password_hash: await hash(ADMIN_PASSWORD, 10), // Hash the password
          role_id: superAdminRole.id,
        },
        include: { roles: true },
      })
    }

    // Verify password for superadmin user
    const isValidPassword = await compare(
      password,
      superAdminUser.password_hash
    )

    if (isValidPassword) {
      const token = sign(
        {
          id: superAdminUser.id.toString(),
          username: superAdminUser.username,
          role: superAdminUser.roles.name,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      )

      const response = NextResponse.json<LoginResponse>({
        success: true,
        token: token,
      })
      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: token,
        httpOnly: true,
        sameSite: "strict",
        maxAge: 60 * 60 * 24, // 24 hours
      })
      return response
    }

    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 403 }
    )
  } catch (error) {
    console.error("Login error details:", error)

    const message = getLoginErrorMessage(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getLoginErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "An error occurred during login"
  }
  const msg =
    "message" in error && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : ""
  const code =
    "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : ""

  if (code === "P1001" || msg.includes("Connection refused") || msg.includes("ECONNREFUSED")) {
    return "Database connection failed. Ensure DATABASE_URL is set in .env and Postgres is running."
  }
  if (code === "P1003" || msg.includes("does not exist")) {
    return "Database not found. Ensure the database in DATABASE_URL exists and migrations have run."
  }
  if (code?.startsWith("P1") || msg.includes("Prisma")) {
    return "Database error. Check DATABASE_URL and that the database schema is initialized."
  }

  return "An error occurred during login"
}
