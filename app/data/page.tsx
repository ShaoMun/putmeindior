"use client";

import { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../lib/firebase";

interface Item {
  id: string;
  name: string;
  createdAt: unknown;
}

export default function DataPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [newItem, setNewItem] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "items"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Item[];
      setItems(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newItem.trim();
    if (!trimmed) return;
    setNewItem("");
    await addDoc(collection(db, "items"), {
      name: trimmed,
      createdAt: serverTimestamp(),
    });
  }

  async function handleDelete(id: string) {
    await deleteDoc(doc(db, "items", id));
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center px-4 py-16">
      <h1 className="text-3xl font-bold mb-8">Firestore Items</h1>

      <form onSubmit={handleAdd} className="flex gap-2 mb-8 w-full max-w-md">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add an item..."
          className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-5 py-2 font-medium hover:bg-blue-500 transition-colors"
        >
          Add
        </button>
      </form>

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-gray-400">No items yet. Add one above!</p>
      ) : (
        <ul className="w-full max-w-md space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-lg bg-gray-800 border border-gray-700 px-4 py-3"
            >
              <span>{item.name}</span>
              <button
                onClick={() => handleDelete(item.id)}
                className="text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
