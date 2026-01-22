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

  isLongStrip(): HTMLElement | null {
    const threshold = window.innerHeight * 3;

    const containers = Array.from(
      document.querySelectorAll('div, section, main, article'),
    ) as HTMLElement[];

    const bestDiv = containers.reduce((best: HTMLElement | null, current) => {
      const style = window.getComputedStyle(current);
      const isScrollable = /(auto|scroll)/.test(style.overflowY + style.overflow);
      const hasContent = current.scrollHeight > current.clientHeight;

      if (!isScrollable || !hasContent) return best;

      // Compare height to our threshold AND current 'best'
      const currentHeight = current.scrollHeight;
      const bestHeight = best ? best.scrollHeight : 0;
      if (currentHeight > threshold && currentHeight > bestHeight) {
        return current;
      }
      return best;
    }, null);

    if (bestDiv) return bestDiv;

    // Final document fallback
    const docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    return docHeight > threshold ? document.documentElement : null;
  }

  saveMangaPage() {
    const root = this.isLongStrip();
    if (!root) return;

    function getElementSelector(el: HTMLElement): number[] {
      const path: number[] = [];
      let current: HTMLElement | null = el;

      while (current && current !== root) {
        const parent = current.parentElement;
        if (!parent) break;

        const index = Array.from(parent.children).indexOf(current);
        path.unshift(index);
        current = parent;
      }
      return path;
    }

    const viewportCenter = window.innerHeight / 2;
    const elements = Array.from(root.querySelectorAll<HTMLElement>('*'));

    const result = elements.reduce(
      (closest, el) => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.opacity === '0') return closest;
        if (!(el.tagName === 'IMG')) return closest;

        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return closest;
        if (rect.height < 100 || rect.width < 200) return closest;

        let currentSearch: HTMLElement | null = el;
        let foundStructuralSiblings = false;

        for (let i = 0; i < 10; i++) {
          if (!currentSearch || currentSearch === root) break;
          const parent = currentSearch.parentElement;
          if (parent && parent.children.length > 2) {
            foundStructuralSiblings = true;
            break; // Found a level with 3 or more siblings, stop climbing
          }
          currentSearch = parent;
        }
        if (!foundStructuralSiblings) return closest;
        const elementCenter = rect.top + rect.height / 2;
        const distance = Math.abs(elementCenter - viewportCenter);

        if (!closest || distance < closest.distance) {
          return { el, distance };
        }
        return closest;
      },
      null as { el: HTMLElement; distance: number } | null,
    );
    let relativeOffset = null as unknown;

    const nearestElement = result?.el;
    if (nearestElement) {
      const pixelPos = nearestElement.getBoundingClientRect();
      if (pixelPos.height > 0) {
        relativeOffset = (viewportCenter - pixelPos.top) / pixelPos.height;
      }
    }
    if (!this.result || !nearestElement || !relativeOffset) {
      logger.log('One of value is null', this.result, nearestElement, relativeOffset);
      return;
    }
    const data = {
      current: this.result.current,
      total: this.result.total,
      nearestElementPath: nearestElement ? getElementSelector(nearestElement) : null,
      pixelOffsets: relativeOffset,
    };
    localStorage.setItem(
      `mangaProgress-${this.page}-${this.identifier}-${this.chapter}`,
      JSON.stringify(data),
    );
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
