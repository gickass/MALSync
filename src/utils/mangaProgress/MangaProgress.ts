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

    this.saveMangaPage();

    if (this.finished() && j.$('#malSyncProgress').length) {
      j.$('#malSyncProgress').addClass('ms-done');
      j.$('.flash.type-update .sync').trigger('click');
      clearInterval(this.interval);
    }
  }

  setIdentifier(identifier: string) {
    if (!this.identifier && identifier) {
      this.identifier = identifier;
    }
  }

  setChapter(chapter: number) {
    if (this.chapter !== null) {
      this.chapter = chapter;
    }
  }

  public getConfigs() {
    return this.configs;
  }

  saveMangaPage() {
    if (!this.result) return;

    const data = {
      current: this.result.current,
      total: this.result.total,
    };

    localStorage.setItem(
      `mangaProgress-${this.page}-${this.identifier}-${this.chapter}`,
      JSON.stringify(data),
    );

    logger.log(`Saved manga progress at ${this.page}-${this.identifier}-${this.chapter}`, data);
  }

  loadMangaPage() {
    const saved = localStorage.getItem(
      `mangaProgress-${this.page}-${this.identifier}-${this.chapter}`,
    );
    if (!saved) return null;

    try {
      const data = JSON.parse(saved);

      // Do NOT scroll here; scroll will happen when user clicks button
      return data;
    } catch (e) {
      console.warn('Failed to load manga progress', e);
      return null;
    }
  }

  resume(savedIndex: number) {
    const scrollEl = this.getScrollableElement();
    logger.log('manga scroll element', scrollEl);
    if (!scrollEl) return;

    const scrollLoop = () => {
      const current = this.getProgress()?.current ?? 0;

      // Stop when we reach saved progress
      if (current >= savedIndex) {
        logger.log('Reached saved progress', current);
        return;
      }

      // Scroll continuously by a chunk
      scrollEl.scrollBy({ top: 40, behavior: 'instant' });

      // Keep looping every frame
      requestAnimationFrame(scrollLoop);
    };

    scrollLoop();
  }

  private getScrollableElement(): HTMLElement {
    const all = Array.from(document.body.querySelectorAll('*')) as HTMLElement[];

    const container = all.find(el => {
      const style = getComputedStyle(el);
      return (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight
      );
    });

    return (container ||
      document.scrollingElement ||
      document.documentElement ||
      document.body) as HTMLElement;
  }
}
