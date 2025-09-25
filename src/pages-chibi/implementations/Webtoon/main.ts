import { $ } from 'src/utils/j';
import { PageInterface } from '../../pageInterface';

export const Webtoon: PageInterface = {
  name: 'Webtoon',
  domain: 'https://www.webtoons.com',
  languages: ['Many'],
  type: 'manga',
  urls: {
    match: ['*://www.webtoons.com/*'],
  },
  search: 'https://www.webtoons.com/en/search?keyword={searchtermRaw}',
  sync: {
    isSyncPage($c) {
      return $c
        .and($c.url().urlPart(7).boolean().run(), $c.url().urlParam('episode_no').boolean().run())
        .run();
    },
    getTitle($c) {
      return $c.querySelector('a.subj').text().trim().run();
    },
    getIdentifier($c) {
      return $c.url().this('sync.getOverviewUrl').this('overview.getIdentifier').run();
    },
    getImage($c) {
      return $c.querySelector('[property="og:image"]').getAttribute('content').ifNotReturn().run();
    },
    getOverviewUrl($c) {
      return $c.querySelector('a.subj').getAttribute('href').ifNotReturn().urlAbsolute().run();
    },
    getEpisode($c) {
      return $c
        .coalesce(
          $c.url().urlPart(6).regex('(?:episode|ep|chapter)[-_]?(\\d+)', 1).run(),
          $c
            .querySelector('a.on')
            .parent()
            .prev()
            .find('a[href*="episode"], a[href*="chapter"], a[href*="ep"]')
            .getAttribute('href')
            .urlPart(6)
            .regex('(?:episode|ep|chapter)[-_]?(\\d+)', 1)
            .ifNotReturn()
            .run(),
        )
        .number()
        .ifNotReturn()
        .run();
    },
    nextEpUrl($c) {
      return $c
        .querySelector('._nextEpisode')
        .getAttribute('href')
        .ifNotReturn()
        .urlAbsolute()
        .run();
    },
    readerConfig: [
      {
        current: {
          selector: '.viewer_img img',
          mode: 'countAbove',
        },
        total: {
          selector: '.viewer_img img',
          mode: 'count',
        },
      },
    ],
  },
  overview: {
    isOverviewPage($c) {
      return $c
        .and($c.url().urlPart(7).boolean().not().run(), $c.url().urlPart(6).equals('list').run())
        .run();
    },
    getTitle($c) {
      return $c.querySelector('[property="og:title"]').getAttribute('content').trim().run();
    },
    getIdentifier($c) {
      return $c.url().urlPart(5).trim().run();
    },
    getImage($c) {
      return $c.querySelector('[property="og:image"]').getAttribute('content').ifNotReturn().run();
    },
    uiInjection($c) {
      return $c.querySelector('.summary').uiAfter().run();
    },
  },
  list: {
    elementsSelector($c) {
      return $c.querySelectorAll('#_listUl ._episodeItem').run();
    },
    elementUrl($c) {
      return $c.find('a').getAttribute('href').urlAbsolute().run();
    },
    elementEp($c) {
      return $c.this('list.elementUrl').this('sync.getEpisode').run();
    },
  },
  lifecycle: {
    setup($c) {
      return $c.addStyle(require('./style.less?raw').toString()).run();
    },
    ready($c) {
      return $c.detectURLChanges($c.trigger().run()).domReady().trigger().run();
    },
  },
};
