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
          $c.fn(baseTitle).concat(' ').concat(getSeasonNamingSync($c)).run(),
          baseTitle,
        )
        .trim()
        .run();
    },
    getIdentifier($c) {
      const baseIdentifier = $c.this('sync.getOverviewUrl').urlPart(5).run();
      return $c
        .if(
          getSeasonCheckSync($c),
          $c.fn(baseIdentifier).concat('-').concat(getSeasonNamingSync($c)).slugify().run(),
          baseIdentifier,
        )
        .slugify()
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
      return $c.querySelector('.episode-watch-title').text().regexAutoGroup(EpRegex).number().run();
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
          $c.fn(baseTitle).ifNotReturn().concat(' ').concat(getSeasonNamingOverview($c)).run(),
          baseTitle,
        )
        .trim()
        .run();
    },
    getIdentifier($c) {
      const baseIdentifier = $c.url().urlPart(5).run();
      return $c
        .if(
          getSeasonCheckOverview($c),
          $c.fn(baseIdentifier).concat('-').concat(getSeasonNamingOverview($c)).slugify().run(),
          baseIdentifier,
        )
        .slugify()
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
      return $c
        .waitUntilTrue($c.querySelector('.episode-series-link').boolean().run())
        .trigger()
        .run();
    },
  },
};

function getSeasonCheckSync($c: ChibiGenerator<unknown>) {
  return $c
    .or(
      $c.title().matches(SeasonRegex).run(),
      $c
        .querySelector('.episode-meta [class*="queue-list"]')
        .text()
        .trim()
        .equals($c.querySelector('.episode-series-link').ifNotReturn().text().trim().run())
        .run(),
    )
    .log('Season 2 or movie check')
    .run();
}

function getSeasonNamingSync($c: ChibiGenerator<unknown>) {
  return $c
    .coalesce(
      $c
        .title()
        .regexAutoGroup(SeasonRegex)
        .ifThen($c => $c.replaceRegex('^', 'Season ').run())
        .run(),
      $c.string(' ').log('No Season Detected').run(),
    )
    .run();
}

function getSeasonCheckOverview($c: ChibiGenerator<unknown>) {
  return $c
    .or(
      $c.querySelector('h2').text().matches(SeasonRegex).run(),
      $c
        .querySelector('h2')
        .text()
        .trim()
        .equals($c.querySelector('.series-title').ifNotReturn().text().trim().run())
        .run(),
    )
    .log('Season 2 or movie check')
    .run();
}

function getSeasonNamingOverview($c: ChibiGenerator<unknown>) {
  return $c
    .coalesce(
      $c
        .querySelector('h2')
        .text()
        .regexAutoGroup(SeasonRegex)
        .ifThen($c => $c.replaceRegex('^', 'Season ').run())
        .run(),
      $c.string(' ').log('No Season Detected').run(),
    )
    .run();
}

const EpRegex = 'E\\s*(\\d+)|Episode\\s*(\\d+)';
const SeasonRegex = 'Season\\s*(?!1\\b)(\\d+)|S\\s*(?!1\\b)(\\d+)';
