import { create } from 'zustand';

const useLinkStore = create((set) => ({
  links: [],
  selectedLink: null,
  isLoading: false,
  error: null,
  totalCount: 0,
  currentPage: 1,

  setLinks: (links) => set({ links }),
  addLink: (link) => set((state) => ({ links: [link, ...state.links] })),
  updateLink: (updatedLink) =>
    set((state) => ({
      links: state.links.map((link) => (link._id === updatedLink._id ? updatedLink : link)),
    })),
  removeLink: (linkId) =>
    set((state) => ({
      links: state.links.filter((link) => link._id !== linkId),
    })),

  setSelectedLink: (link) => set({ selectedLink: link }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setTotalCount: (count) => set({ totalCount: count }),
  setCurrentPage: (page) => set({ currentPage: page }),

  clearError: () => set({ error: null }),
}));

export default useLinkStore;
