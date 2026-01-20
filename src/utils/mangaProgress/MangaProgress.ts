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

    if (this.page && this.identifier && this.chapter && (this.result?.current || 0) > 1)
      this.saveMangaPage();

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
    const docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const threshold = window.innerHeight * 3;
    // Return true if page already has long base scroll
    if (docHeight > threshold) return true;

    return Array.from(document.querySelectorAll('div, section, main, article')).some(el => {
      const htmlEl = el as HTMLElement;
      const style = window.getComputedStyle(htmlEl);
      const isScrollableCSS = /(auto|scroll|overlay)/.test(style.overflowY + style.overflow);
      if (isScrollableCSS) {
        return htmlEl.scrollHeight > threshold;
      }
      return false;
    });
  }

  saveMangaPage() {
    if (!this.isLongStrip()) return;

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

    const viewportCenter = window.innerHeight / 2;
    const elements = Array.from(document.body.querySelectorAll<HTMLElement>('*'));

    const result = elements.reduce(
      (closest, el) => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.opacity === '0') return closest;

        // Filter for <img> OR divs with background images
        const hasImage =
          el.tagName.toLowerCase() === 'img' ||
          (style.backgroundImage && style.backgroundImage !== 'none');

        if (!hasImage) return closest;

        const rect = el.getBoundingClientRect();

        // Filters (Off-screen or too small elements)
        if (rect.bottom < 0 || rect.top > window.innerHeight) return closest;
        if (rect.height < 100 || rect.width < 200) return closest;

        const siblingImages = el.parentElement?.querySelectorAll('img').length || 0;
        const cousinImages = el.parentElement?.parentElement?.querySelectorAll('img').length || 0;
        if (!(siblingImages > 2 || cousinImages > 5)) return closest;

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

  async loadMangaPage() {
    const isReady = await new Promise(resolve => {
      let attempts = 0;
      const interval = setInterval(() => {
        if (this.isLongStrip()) {
          clearInterval(interval);
          resolve(true);
        }
        if (++attempts > 10) {
          // Check only for 5 seconds after page load
          clearInterval(interval);
          resolve(false);
        }
      }, 500);
    });
    if (!isReady) {
      logger.log('Page save only support for long strip as of now');
      return null;
    }

    const saved = localStorage.getItem(
      `mangaProgress-${this.page}-${this.identifier}-${this.chapter}`,
    );
    if (!saved) return null;

    try {
      const data = JSON.parse(saved);
      if (data.current === data.total) return null;

      return data;
    } catch (e) {
      logger.warn('Failed to load manga progress', e);
      return null;
    }
  }
}
