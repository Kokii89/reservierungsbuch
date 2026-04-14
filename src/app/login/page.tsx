"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");

  const supabase = createClient();

  async function handleLogin() {
    if (!username || !pin) {
      alert("Bitte Benutzername und PIN eingeben");
      return;
    }

    const email = `${username.toLowerCase()}@taki.local`;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pin,
    });

    if (error) {
      console.error("Login error:", error);
      alert("Falscher Benutzername oder PIN");
      return;
    }

    window.location.href = "/";
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="p-6 border rounded-xl space-y-3">
        <h1 className="text-xl font-bold">Admin Login</h1>

        <input
          className="border p-2 w-full"
          placeholder="Benutzername"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          className="border p-2 w-full"
          type="password"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />

        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={handleLogin}
        >
          Login
        </button>
      </div>
    </div>
  );
}