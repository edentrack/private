/**
 * WhatsApp Support Utility
 * Generates WhatsApp links for support
 */

export interface WhatsAppSupportConfig {
  number: string;
  message: string;
}

/**
 * Generate WhatsApp support link
 */
export function getWhatsAppSupportLink(config: WhatsAppSupportConfig | null): string | null {
  if (!config || !config.number) {
    return null;
  }

  // Remove any non-digit characters except +
  const cleanNumber = config.number.replace(/[^\d+]/g, '');
  
  // Encode the message
  const encodedMessage = encodeURIComponent(config.message);
  
  // Generate WhatsApp link
  return `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
}

/**
 * Open WhatsApp support in new window
 */
export function openWhatsAppSupport(config: WhatsAppSupportConfig | null) {
  const link = getWhatsAppSupportLink(config);
  if (link) {
    window.open(link, '_blank');
  }
}











