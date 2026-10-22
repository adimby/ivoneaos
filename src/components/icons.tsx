import type { ComponentProps } from "react";

// Icônes au trait (24×24), couleur héritée, décoratives (aria-hidden).
function Icon({ children, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z" />
  </Icon>
);
export const PipelineIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <rect x="3.5" y="4" width="4.5" height="16" rx="1.5" />
    <rect x="9.75" y="4" width="4.5" height="11" rx="1.5" />
    <rect x="16" y="4" width="4.5" height="7" rx="1.5" />
  </Icon>
);
export const InvoiceIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14.5 3v4.5H19M8.5 12h7M8.5 16h4.5" />
  </Icon>
);
export const MoreIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <circle cx="5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="19" cy="12" r="1.3" fill="currentColor" />
  </Icon>
);
export const ContactsIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 7.4M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
  </Icon>
);
export const SettingsIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Icon>
);
export const SignOutIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9.5 16.5 5 12l4.5-4.5M5 12h10" />
  </Icon>
);
export const CheckIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const ChevronRightIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
);
export const WalletIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="M4 7a2 2 0 0 1 2-2h11v4M4 7v11a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6a2 2 0 0 1-2-2Z" />
    <circle cx="16" cy="14.5" r="1.2" fill="currentColor" />
  </Icon>
);
export const PhoneIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" />
  </Icon>
);
export const ChatIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="M4.5 19.5 6 15.6A8 8 0 1 1 8.6 18Z" />
    <path d="M9 10.5h6M9 13.5h4" />
  </Icon>
);
export const MailIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Icon>
);
export const PlusIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const SearchIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);
export const BellIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Icon>
);
export const ArrowRightIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
export const PaletteIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3Z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="10" cy="7" r="1" />
    <circle cx="15" cy="7.5" r="1" />
  </Icon>
);
export const BrushIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="M14.5 4.5 19.5 9.5 11 18l-5-5Z" />
    <path d="M6 13c-2 0-3 1.5-3 3.5V20h3.5C8.5 20 10 19 10 17" />
  </Icon>
);
export const ShieldIcon = (p: ComponentProps<"svg">) => (
  <Icon {...p}>
    <path d="M12 3 5 6v5.5c0 4.2 2.9 7.9 7 9.5 4.1-1.6 7-5.3 7-9.5V6Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);
