"use client";

import { create } from "zustand";

interface SearchState {
  isOpen: boolean;
  query: string;
  setIsOpen: (isOpen: boolean) => void;
  openSearch: (initialQuery?: string) => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  isOpen: false,
  query: "",
  setIsOpen: (isOpen) => set({ isOpen }),
  openSearch: (initialQuery = "") => set({ isOpen: true, query: initialQuery }),
  closeSearch: () => set({ isOpen: false, query: "" }),
  setQuery: (query) => set({ query }),
}));
