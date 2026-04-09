import { PageInterface } from '../../pageInterface';

export const MangaCloud: PageInterface = {
  name: 'MangaCloud',
  domain: 'https://www.mangacloud.org/',
  languages: ['English'],
  type: 'manga',
  urls: {
    match: ['*://mangacloud.org/*'],
  },
  search: 'https://mangacloud.org/browse?title={searchtermRaw}',
  sync: {
    isSyncPage($c) {
      return $c
        .and($c.url().urlPart(6).boolean().run(), $c.url().urlPart(5).equals('chapter').run())
        .run();
    },
    getTitle($c) {
      return $c.querySelector('a[href*="/comic/"]').ifNotReturn().text().trim().run();
    },
    getIdentifier($c) {
      return $c.url().urlPart(4).trim().run();
    },
    getOverviewUrl($c) {
      return $c
        .querySelector('a[href*="/comic/"]')
        .getAttribute('href')
        .ifNotReturn()
        .urlAbsolute()
        .run();
    },
    getEpisode($c) {
      return $c
        .querySelector('[name="chapters"] option:checked')
        .text()
        .regex('\\d+')
        .number()
        .run();
    },
    nextEpUrl($c) {
      return $c
        .url()
        .replaceRegex(
          '[^/]+$',
          $c
            .querySelector('[name="chapters"] option:checked')
            .getAttribute('value')
            .ifNotReturn()
            .run(),
        )
        .run();
    },
    readerConfig: [
      /*
      {
        condition: $c => $c.querySelector('.min-h-screen[tabindex]').boolean().run(),
        current: $c =>
          $c
            .querySelectorAll('img[alt]')
            .arrayFind($c => $c.checkVisibility().run())
            .getAttribute('alt')
            .regex('(\\d+)\\s*\\/\\s*(\\d+)', 1)
            .number()
            .run(),
        total: $c =>
          $c
            .querySelectorAll('img[alt]')
            .arrayFind($c => $c.checkVisibility().run())
            .getAttribute('alt')
            .regex('(\\d+)\\s*\\/\\s*(\\d+)', 2)
            .number()
            .run(),
      },
      */
      {
        current: $c => $c.querySelectorAll('img[alt]').countAbove().run(),
        total: $c => $c.querySelectorAll('img[alt]').length().run(),
      },
    ],
  },
  overview: {
    isOverviewPage($c) {
      return $c
        .and($c.url().urlPart(4).boolean().run(), $c.url().urlPart(3).equals('series').run())
        .run();
    },
    getTitle($c) {
      return $c.querySelector('h1').ifNotReturn().text().trim().run();
    },
    getIdentifier($c) {
      return $c.url().urlPart(4).trim().run();
    },
    getImage($c) {
      return $c.querySelector('[href*="thumbnail"] img').getAttribute('src').ifNotReturn().run();
    },
    getMalUrl($c) {
      return $c
        .providerUrlUtility({
          malUrl: $c
            .querySelector('a[href*="myanimelist"]')
            .getAttribute('href')
            .ifNotReturn()
            .run(),
          anilistUrl: $c
            .querySelector('a[href*="anilist"]')
            .getAttribute('href')
            .ifNotReturn()
            .run(),
        })
        .run();
    },
    uiInjection($c) {
      return $c.querySelector('h1').uiAfter().run();
    },
  },
  list: {
    elementsSelector($c) {
      return $c.querySelectorAll('a[href*="read"]').run();
    },
    elementUrl($c) {
      return $c.getAttribute('href').ifNotReturn().urlAbsolute().run();
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
