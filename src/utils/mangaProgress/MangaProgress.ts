import { collectorConfig, executeCollector } from './ModeFactory';

export type mangaProgressConfig = {
  condition?: string | (() => boolean);
  current: collectorConfig;
  total: collectorConfig;
};

export type mangaProgress = { current: number; total: number };

const logger = con.m('MangaProgress');

const alternativeReader: mangaProgressConfig[] = [
  // AMR
  {
    condition: '#amrapp',
    current: {
      mode: 'text',
      selector: '.amr-pages-nav .text-h6',
      regex: '(\\d+) /',
      group: 1,
    },
    total: {
      mode: 'text',
      selector: '.amr-pages-nav .text-h6',
      regex: '/ (\\d+)',
      group: 1,
    },
  },
];

export class MangaProgress {
  protected configs: mangaProgressConfig[];

  protected page: string;

  protected identifier?: string;

  protected chapter?: number;

  protected result: mangaProgress | null = null;

  protected interval;

  protected stopPromise = () => {
    // do nothing
  };

  constructor(configs: mangaProgressConfig[], page: string, identifier?: string, chapter?: number) {
    this.configs = [...alternativeReader, ...configs];
    this.page = page;
    this.identifier = identifier;
    this.chapter = chapter;
    logger.log('config', this.configs);
  }

  protected getProgressFromCollectors(config: mangaProgressConfig) {
    const current = executeCollector(config.current);
    const total = executeCollector(config.total);
    return { current, total };
  }

  protected applyConfig() {
    for (const key in this.configs) {
      const config = this.configs[key];
      if (typeof config.condition !== 'undefined') {
        if (typeof config.condition === 'function' && config.condition() === false) continue;
        if (typeof config.condition === 'string' && !j.$(config.condition).length) continue;
      }
      try {
        return this.getProgressFromCollectors(config);
      } catch (e) {
        logger.m(`skip ${key}`).debug(e.message, config);
      }
    }
    return null;
  }

  getProgress() {
    return this.result;
  }

  isSuccessful() {
    return this.result !== null;
  }

  protected getLimit() {
    const percentage = api.settings.get('mangaCompletionPercentage');
    const result = this.getProgress();
    if (result === null) return 0;
    const limit = Math.floor((result.total / 100) * percentage);
    return limit;
  }

  progressPercentage() {
    const result = this.getProgress();
    if (result === null) return null;
    if (result.total === 0) return 0;
    const res = result.current / this.getLimit();
    if (res > 1) return 1;
    if (res < 0) return 0;
    return res;
  }

  finished(): boolean {
    const result = this.getProgress();
    if (result === null) return false;
    const limit = this.getLimit();
    if (limit < 1) return true;
    return result.current >= limit;
  }

  execute() {
    this.result = this.applyConfig();
  }

  async start() {
    clearInterval(this.interval);
    return new Promise<boolean>((resolve, reject) => {
      this.stopPromise = () => resolve(false);
      let resolved = false;
      this.interval = setInterval(() => {
        this.execute();

        if (!this.isSuccessful()) {
          clearInterval(this.interval);
          reject(new Error('MangaProgress: Progress not found'));
          return;
        }

        if (!resolved) {
          resolved = true;
          resolve(true);
        }

        this.setProgress();

        logger.debug(this.finished(), this.getProgress());
      }, 1000);
    });
  }

  stop() {
    clearInterval(this.interval);
  }

  setProgress() {
    j.$('.ms-progress').css('width', `${this.progressPercentage()! * 100}%`);
    j.$('#malSyncProgress').removeClass('ms-loading').removeClass('ms-done');

    if (this.page && this.identifier && this.chapter) this.saveMangaPage();

    if (this.finished() && j.$('#malSyncProgress').length) {
      j.$('#malSyncProgress').addClass('ms-done');
      j.$('.flash.type-update .sync').trigger('click');
      clearInterval(this.interval);
    }
  }

  setIdentifier(identifier: string) {
    if (this.identifier !== identifier) {
      this.identifier = identifier;
    }
  }

  setChapter(chapter: number) {
    if (this.chapter !== chapter) {
      this.chapter = chapter;
    }
  }

  // Page saving/loading logic

  private isLongStrip(): boolean {
    const threshold = window.innerHeight * 2;

    const docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    if (docHeight > threshold) return true;

    const containers = Array.from(document.querySelectorAll('div, section, article'));
    const hasBigContainer = containers.some(el => el.scrollHeight > threshold);

    return hasBigContainer;
  }

  saveMangaPage() {
    if (!this.isLongStrip()) return;

    const elements = Array.from(document.body.querySelectorAll<HTMLElement>('*'));
    const viewportCenter = window.innerHeight / 2;

    const result = elements.reduce(
      (closest, el) => {
        const style = getComputedStyle(el);

        // Skip invisible elements
        if (style.display === 'none' || style.opacity === '0') return closest;

        // Filter for <img> OR divs with background images
        const hasImage =
          el.tagName.toLowerCase() === 'img' ||
          (style.backgroundImage && style.backgroundImage !== 'none');

        if (!hasImage) return closest;

        const rect = el.getBoundingClientRect();

        // Filters (Off-screen or too small elements)
        if (rect.bottom < 0 || rect.top > window.innerHeight) return closest;
        if (rect.height < 100) return closest;

        const elementCenter = rect.top + rect.height / 2;
        const distance = Math.abs(elementCenter - viewportCenter);

        // comparison If we have no 'closest' yet, or the current 'distance' is smaller than the filtered distance
        if (!closest || distance < closest.distance) {
          return { el, distance };
        }

        return closest;
      },
      null as { el: HTMLElement; distance: number } | null,
    );

    let relativeOffset = 0.5;
    const nearestElement = result?.el;
    if (nearestElement) {
      const pixelPos = nearestElement.getBoundingClientRect();
      if (pixelPos.height > 0) {
        relativeOffset = (viewportCenter - pixelPos.top) / pixelPos.height;
      }
    }

    function getElementSelector(el: HTMLElement): number[] {
      const path: number[] = [];
      let current: HTMLElement | null = el;

      while (current && current !== document.body) {
        const parent = current.parentElement;
        if (!parent) break;

        const index = Array.from(parent.children).indexOf(current);
        path.unshift(index);
        current = parent;
      }
      return path;
    }

    const data = {
      current: this.result?.current,
      total: this.result?.total,
      nearestElementPath: nearestElement ? getElementSelector(nearestElement) : null,
      pixelOffsets: relativeOffset,
    };

    localStorage.setItem(
      `mangaProgress-${this.page}-${this.identifier}-${this.chapter}`,
      JSON.stringify(data),
    );
    logger.log(`Saved manga progress at ${this.page}-${this.identifier}-${this.chapter}`, data);
  }

  loadMangaPage() {
    if (!this.isLongStrip()) return null;
    const saved = localStorage.getItem(
      `mangaProgress-${this.page}-${this.identifier}-${this.chapter}`,
    );
    if (!saved) return null;

    try {
      const data = JSON.parse(saved);

      return data;
    } catch (e) {
      logger.warn('Failed to load manga progress', e);
      return null;
    }
  }

  resume(saved) {
    if (!saved) return;

    function getElementFromPath(path: number[]): HTMLElement | null {
      return path.reduce<HTMLElement | null>((current, index) => {
        if (!current) return null;
        const nextChild = current.children[index] as HTMLElement;
        return nextChild || current;
      }, document.body);
    }

    const el = getElementFromPath(saved.nearestElementPath);
    if (!el) return;

    function getScrollElement(el) {
      let current = el.parentElement;

      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const hasScrollbar = current.scrollHeight > current.clientHeight;
        const isScrollable = /(auto|scroll)/.test(style.overflowY + style.overflow);

        if (hasScrollbar && isScrollable) {
          return current;
        }
        current = current.parentElement;
      }
      return document.documentElement;
    }

    const performPrecisionScroll = () => {
      const container = getScrollElement(el);
      const rect = el.getBoundingClientRect();

      const isMainOrDiv = container === document.documentElement || container === document.body;

      const currentScroll = isMainOrDiv
        ? window.pageYOffset || document.documentElement.scrollTop
        : container.scrollTop;

      // If div, find container's offset from the top of the screen
      const containerTop = isMainOrDiv ? 0 : container.getBoundingClientRect().top;
      const elementTopInContainer = currentScroll + (rect.top - containerTop);
      const absoluteTargetPoint = elementTopInContainer + rect.height * (saved.pixelOffsets || 0.5);
      const finalTarget = absoluteTargetPoint - window.innerHeight / 2;

      container.scrollTo({
        top: finalTarget,
        behavior: 'smooth',
      });
    };

    performPrecisionScroll();
    let checks = 0;
    const scrollInterval = setInterval(() => {
      performPrecisionScroll();
      checks++;

      // Stop after few second or if the user starts scrolling manually
      if (checks > 6) {
        clearInterval(scrollInterval);
      }
    }, 500);

    // Stop the scroll if the user scrolls manually
    const stopOnUserScroll = () => {
      clearInterval(scrollInterval);
      window.removeEventListener('wheel', stopOnUserScroll);
      window.removeEventListener('touchmove', stopOnUserScroll);
    };
    window.addEventListener('wheel', stopOnUserScroll);
    window.addEventListener('touchmove', stopOnUserScroll);
    logger.log('Resumed manga progress', saved);
  }
}
