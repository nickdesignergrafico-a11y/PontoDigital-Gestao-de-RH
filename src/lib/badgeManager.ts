// Gerenciador do Contador de Mensagens no Ícone do Aplicativo (App Badge Counter)
// Suporta:
// 1. Web Badging API (navigator.setAppBadge) - Ícone nativo no Android, iOS PWA e Desktop
// 2. Favicon Dinâmico com Contador - Ícone da aba em qualquer navegador (Desktop e Celular)
// 3. Título dinâmico da página com (N)
// 4. Efeito sonoro suave para novos alertas

let originalFaviconHref: string | null = null;
const originalTitle = typeof document !== 'undefined' ? document.title.replace(/^\(\d+\+?\)\s*/, '') : 'PontoDigital';

/**
 * Atualiza o selo numérico no ícone do aplicativo PWA / Desktop via Badging API
 */
export const setNativeAppBadge = async (count: number): Promise<void> => {
  if (typeof navigator === 'undefined') return;

  try {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        await (navigator as any).setAppBadge(count);
      } else {
        await (navigator as any).clearAppBadge();
      }
    }
  } catch (err) {
    // Alguns navegadores exigem flags ou ignoram silenciosamente
    console.debug('Badging API não suportada ou permissão pendente:', err);
  }
};

/**
 * Limpa o selo do ícone do aplicativo
 */
export const clearNativeAppBadge = async (): Promise<void> => {
  if (typeof navigator === 'undefined') return;

  try {
    if ('clearAppBadge' in navigator) {
      await (navigator as any).clearAppBadge();
    }
  } catch (err) {
    console.debug('Erro ao limpar badge:', err);
  }
};

/**
 * Desenha um ícone dinâmico com badge circular vermelho no Favicon da aba
 */
export const updateDynamicFaviconBadge = (count: number): void => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  try {
    let faviconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
    if (!faviconLink) {
      faviconLink = document.createElement('link');
      faviconLink.rel = 'icon';
      document.head.appendChild(faviconLink);
    }

    if (!originalFaviconHref) {
      originalFaviconHref = faviconLink.href || '/pwa-icon.png';
    }

    if (count <= 0) {
      faviconLink.href = originalFaviconHref;
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = originalFaviconHref;

    const drawBadge = () => {
      ctx.clearRect(0, 0, 64, 64);

      // Desenha imagem base (ou fundo se ainda não carregou)
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, 64, 64);
      } else {
        // Fallback elegante com gradiente moderno PontoDigital
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(0, 0, 64, 64, 16);
        ctx.fill();
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PD', 32, 34);
      }

      // Desenha o círculo do badge vermelho no canto superior direito
      const badgeText = count > 99 ? '99+' : String(count);
      const badgeRadius = badgeText.length > 2 ? 18 : 16;
      const badgeX = 64 - badgeRadius;
      const badgeY = badgeRadius;

      // Sombra do badge
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      // Círculo externo branco (borda de destaque)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeRadius + 2, 0, 2 * Math.PI);
      ctx.fill();

      // Círculo interno vermelho vivo
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
      ctx.fill();

      // Reset sombra para texto
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Texto do contador em branco
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${badgeText.length > 2 ? 16 : 20}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, badgeX, badgeY + 1);

      // Aplica ao link do favicon
      faviconLink!.href = canvas.toDataURL('image/png');
    };

    if (img.complete) {
      drawBadge();
    } else {
      img.onload = drawBadge;
      img.onerror = drawBadge; // usa fallback elegante
    }
  } catch (err) {
    console.debug('Erro ao desenhar badge no favicon:', err);
  }
};

/**
 * Atualiza o título da página com o contador de mensagens
 */
export const updateDocumentTitleBadge = (count: number): void => {
  if (typeof document === 'undefined') return;

  const cleanTitle = document.title.replace(/^\(\d+\+?\)\s*/, '');
  if (count > 0) {
    const badgeText = count > 99 ? '99+' : count;
    document.title = `(${badgeText}) ${cleanTitle}`;
  } else {
    document.title = cleanTitle;
  }
};

/**
 * Executa todas as atualizações de badge do aplicativo de forma sincronizada
 */
export const updateAllAppBadges = (unreadCount: number): void => {
  const safeCount = Math.max(0, unreadCount || 0);

  // 1. Ícone nativo do aplicativo instalado (PWA / Android / iOS / Desktop)
  setNativeAppBadge(safeCount);

  // 2. Favicon na aba do navegador
  updateDynamicFaviconBadge(safeCount);

  // 3. Título da aba
  updateDocumentTitleBadge(safeCount);
};
