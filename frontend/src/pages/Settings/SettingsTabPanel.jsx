import { motion } from 'framer-motion';

/** Fade-in container every settings tab renders into (remounts, so it replays, on tab change). */
export default function SettingsTabPanel({ children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-4xl">
      {children}
    </motion.div>
  );
}
