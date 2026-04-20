interface ChickenIconProps {
  className?: string;
}

export function ChickenIcon({ className = "w-6 h-6" }: ChickenIconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      className={className}
    >
      <path d="M16 3c1.5 0 2.8.8 3.5 2 .3-.5.8-1 1.5-1 1 0 2 .8 2 2s-1 2-2 2h-.5c.3.6.5 1.3.5 2 0 2.2-1.8 4-4 4-.4 0-.8-.1-1.2-.2C14.7 15.5 13 17 11 17.5V22h1c1.1 0 2 .9 2 2v2h-2v2h-4v-2H6v-2c0-1.1.9-2 2-2h1v-4.5c-2-.5-3.7-2-4.8-3.8-.4.1-.8.2-1.2.2-2.2 0-4-1.8-4-4 0-.7.2-1.4.5-2H9c-1 0-2-.8-2-2s1-2 2-2c.7 0 1.2.5 1.5 1 .7-1.2 2-2 3.5-2z" />
    </svg>
  );
}
