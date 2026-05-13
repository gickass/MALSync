import { get } from 'jquery';
import type { ChibiGenerator } from '../../../chibiScript/ChibiGenerator';
import { PageInterface } from '../../pageInterface';

export const UniqueStream: PageInterface = {
  name: 'UniqueStream',
  domain: 'https://anime.uniquestream.net',
  languages: ['English'],
  type: 'anime',
  urls: {
    match: ['*://anime.uniquestream.net/*'],
  },
  search: 'https://anime.uniquestream.net/search?q={searchtermPlus}',
  sync: {
    isSyncPage($c) {
      return $c
        .and($c.url().urlPart(5).boolean().run(), $c.url().urlPart(3).equals('watch').run())
        .run();
    },
    getTitle($c) {
      const baseTitle = $c.querySelector('.episode-series-link').ifNotReturn().text().trim().run();
      return $c
        .if(
          getSeasonCheckSync($c),
          $c
            .fn(baseTitle)
            .concat(' ')
            .concat($c.title().regex('Season \\d+').ifNotReturn().trim().run())
            .run(),
          baseTitle,
        )
        .run();
    },
    getIdentifier($c) {
      const baseIdentifier = $c.this('sync.getOverviewUrl').urlPart(5).run();
      return $c
        .if(
          getSeasonCheckSync($c),
          $c
            .fn(baseIdentifier)
            .concat('-')
            .concat($c.title().regex('Season \\d+').ifNotReturn().trim().run())
            .slugify()
            .run(),
          baseIdentifier,
        )
        .run();
    },
    getOverviewUrl($c) {
      return $c
        .querySelector('.episode-series-link')
        .ifNotReturn()
        .getAttribute('href')
        .urlAbsolute()
        .run();
    },
    getEpisode($c) {
      return $c.querySelector('episode-watch-title').text().regex(EpRegex).number().run();
    },
    nextEpUrl($c) {
      return $c
        .querySelectorAll('.np-label')
        .arrayFind($text => $text.text().contains('Next Episode').run())
        .ifNotReturn()
        .closest('a')
        .getAttribute('href')
        .urlAbsolute()
        .run();
    },
  },
  overview: {
    isOverviewPage($c) {
      return $c
        .and($c.url().urlPart(5).boolean().run(), $c.url().urlPart(3).equals('series').run())
        .run();
    },
    getTitle($c) {
      const baseTitle = $c.querySelector('.series-title').ifNotReturn().text().trim().run();
      return $c
        .if(
          getSeasonCheckOverview($c),
          baseTitle,
          $c
            .fn(baseTitle)
            .ifNotReturn()
            .concat(' ')
            .concat($c.querySelector('h2').ifNotReturn().text().trim().run())
            .run(),
        )
        .run();
    },
    getIdentifier($c) {
      const baseIdentifier = $c.url().urlPart(5).run();
      return $c
        .if(
          getSeasonCheckOverview($c),
          baseIdentifier,
          $c
            .fn(baseIdentifier)
            .concat('-')
            .concat($c.querySelector('h2').ifNotReturn().text().trim().run())
            .slugify()
            .run(),
        )
        .run();
    },
    getImage($c) {
      return $c.querySelector('.object-cover').getAttribute('src').ifNotReturn().run();
    },
    uiInjection($c) {
      return $c.querySelector('.series-title').uiBefore().run();
    },
  },
  list: {
    elementsSelector($c) {
      return $c.querySelectorAll('.place-content-start a').run();
    },
    elementUrl($c) {
      return $c.getAttribute('href').urlAbsolute().run();
    },
    elementEp($c) {
      return $c.find('.episode-title').text().regex(EpRegex).number().run();
    },
  },
  lifecycle: {
    setup($c) {
      return $c.addStyle(require('./style.less?raw').toString()).run();
    },
    ready($c) {
      return $c
        .detectURLChanges($c.trigger().run())
        .detectChanges(
          $c.querySelector('[class*="season-dropdown"] h2').ifNotReturn().text().run(),
          $c.trigger().run(),
        )
        .domReady()
        .trigger()
        .run();
    },
    overviewIsReady($c) {
      return $c
        .waitUntilTrue($c.querySelector('.place-content-start').boolean().run())
        .trigger()
        .run();
    },
    syncIsReady($c) {
      return $c.waitUntilTrue($c.querySelector('#videoContainer').boolean().run()).trigger().run();
    },
  },
};

function getSeasonCheckSync($c: ChibiGenerator<unknown>) {
  return $c.title().matches('Season\\s*1|S\\s*1').log().run();
}

function getSeasonCheckOverview($c: ChibiGenerator<unknown>) {
  return $c.querySelector('h2').text().matches('Season\\s*1|S\\s*1').log().run();
}

const EpRegex = 'E\\s*(\\d+)|Episode\\s*(\\d+)';
