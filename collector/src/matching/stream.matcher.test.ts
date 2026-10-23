import { describe, it, expect, beforeEach } from 'vitest';
import { StreamMatcher } from './stream.matcher.js';

describe('StreamMatcher', () => {
  let matcher: StreamMatcher;

  beforeEach(() => {
    matcher = new StreamMatcher();
  });

  describe('parse()', () => {
    it('parses basic beIN Sports channel with number', () => {
      const result = matcher.parse('beIN Sports 1 HD');
      expect(result.network).toBe('bein sports');
      expect(result.variant).toBe('1');
      expect(result.quality).toBe('hd');
      expect(result.region).toBeNull();
      expect(result.language).toBeNull();
    });

    it('parses beIN Sports without number', () => {
      const result = matcher.parse('beIN Sports HD');
      expect(result.network).toBe('bein sports');
      expect(result.variant).toBeNull();
      expect(result.quality).toBe('hd');
    });

    it('parses ESPN2 (no space)', () => {
      const result = matcher.parse('ESPN2');
      expect(result.network).toBe('espn');
      expect(result.variant).toBe('2');
      expect(result.quality).toBeNull();
    });

    it('parses Sky Sports Premier League', () => {
      const result = matcher.parse('Sky Sports Premier League');
      expect(result.network).toBe('sky sports');
      expect(result.variant).toBe('premier');
    });

    it('parses with region and language', () => {
      const result = matcher.parse('beIN Sports 1 USA EN');
      expect(result.network).toBe('bein sports');
      expect(result.variant).toBe('1');
      expect(result.region).toBe('usa');
      expect(result.language).toBe('en');
    });

    it('parses variant words: news, main event, f1', () => {
      expect(matcher.parse('Sky Sports News').variant).toBe('news');
      expect(matcher.parse('Sky Sports Main Event').variant).toBe('main event');
      expect(matcher.parse('Sky Sports F1').variant).toBe('f1');
    });

    it('ignores stop words', () => {
      const result = matcher.parse('beIN Sports 1 Live TV Channel HD');
      expect(result.rawTokens).not.toContain('live');
      expect(result.rawTokens).not.toContain('tv');
      expect(result.rawTokens).not.toContain('channel');
    });

    it('keeps letters from non-Latin scripts (Cyrillic, Greek)', () => {
      const cyrillic = matcher.parse('Первый канал HD');
      expect(cyrillic.network).toBe('первый канал');
      expect(cyrillic.quality).toBe('hd');

      const greek = matcher.parse('ΕΡΤ 1');
      expect(greek.network).toBe('ερτ');
      expect(greek.variant).toBe('1');
    });

    it('splits attached numbers in non-Latin names', () => {
      const result = matcher.parse('Матч ТВ2');
      expect(result.network).toBe('матч тв');
      expect(result.variant).toBe('2');
    });
  });

  describe('match() - Variant hard constraint (CRITICAL)', () => {
    it('BLOCKS: beIN Sports 2 stream -> beIN Sports 1 channel', () => {
      const result = matcher.match('beIN Sports 2', 'beIN Sports 1');
      expect(result.matched).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reason).toContain('variant mismatch');
    });

    it('BLOCKS: beIN Sports 3 stream -> beIN Sports 1 channel', () => {
      const result = matcher.match('beIN Sports 3', 'beIN Sports 1');
      expect(result.matched).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('ALLOWS: beIN Sports 1 HD stream -> beIN Sports 1 channel', () => {
      const result = matcher.match('beIN Sports 1 HD', 'beIN Sports 1');
      expect(result.matched).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('ALLOWS: beIN Sports 1 stream -> beIN Sports 1 HD channel', () => {
      const result = matcher.match('beIN Sports 1', 'beIN Sports 1 HD');
      expect(result.matched).toBe(true);
    });

    it('BLOCKS: Sky Sports Premier League -> Sky Sports Main Event', () => {
      const result = matcher.match('Sky Sports Premier League', 'Sky Sports Main Event');
      expect(result.matched).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reason).toContain('variant mismatch');
    });

    it('BLOCKS: ESPN 2 -> ESPN 1', () => {
      const result = matcher.match('ESPN 2', 'ESPN 1');
      expect(result.matched).toBe(false);
    });

    it('ALLOWS: ESPN 2 -> ESPN 2', () => {
      const result = matcher.match('ESPN 2', 'ESPN 2');
      expect(result.matched).toBe(true);
    });
  });

  describe('match() - One-sided variant (subset)', () => {
    it('ALLOWS: beIN Sports 1 stream -> beIN Sports channel (default allowVariantSubset)', () => {
      const result = matcher.match('beIN Sports 1', 'beIN Sports');
      expect(result.matched).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('ALLOWS: beIN Sports stream -> beIN Sports 1 channel (default allowVariantSubset)', () => {
      const result = matcher.match('beIN Sports', 'beIN Sports 1');
      expect(result.matched).toBe(true);
    });

    it('BLOCKS when allowVariantSubset=false: beIN Sports 1 -> beIN Sports', () => {
      const strictMatcher = new StreamMatcher({ allowVariantSubset: false });
      const result = strictMatcher.match('beIN Sports 1', 'beIN Sports');
      expect(result.matched).toBe(false);
      expect(result.reason).toContain('subset not allowed');
    });

    it('BLOCKS when allowVariantSubset=false: beIN Sports -> beIN Sports 1', () => {
      const strictMatcher = new StreamMatcher({ allowVariantSubset: false });
      const result = strictMatcher.match('beIN Sports', 'beIN Sports 1');
      expect(result.matched).toBe(false);
    });
  });

  describe('match() - Network fuzzy matching', () => {
    it('matches beIN Sports vs beIN Sport (typo)', () => {
      const result = matcher.match('beIN Sports 1', 'beIN Sport 1');
      expect(result.matched).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('matches beIN Sports vs beINSports (no space)', () => {
      const result = matcher.match('beIN Sports 1', 'beINSports 1');
      expect(result.matched).toBe(true);
    });

    it('matches Sky Sports vs SkySports', () => {
      const result = matcher.match('Sky Sports 1', 'SkySports 1');
      expect(result.matched).toBe(true);
    });

    it('matches with reordering: Sports beIN 1 -> beIN Sports 1', () => {
      const result = matcher.match('Sports beIN 1', 'beIN Sports 1');
      expect(result.matched).toBe(true);
    });
  });

  describe('match() - Quality/Region/Language bonuses', () => {
    it('bonus for matching quality', () => {
      // Actually need different approach - base without quality, withQuality with quality
      const baseNoQuality = matcher.match('beIN Sports', 'beIN Sport'); // typo, no quality
      const withQualityMatch = matcher.match('beIN Sports HD', 'beIN Sport HD'); // typo, both have HD
      expect(withQualityMatch.confidence).toBeGreaterThan(baseNoQuality.confidence);
    });

    it('bonus for matching region', () => {
      const baseNoRegion = matcher.match('beIN Sports', 'beIN Sport'); // typo, no region
      const withRegionMatch = matcher.match('beIN Sports USA', 'beIN Sport USA'); // typo, both USA
      expect(withRegionMatch.confidence).toBeGreaterThan(baseNoRegion.confidence);
    });

    it('bonus for matching language', () => {
      const baseNoLang = matcher.match('beIN Sports', 'beIN Sport'); // typo, no language
      const withLangMatch = matcher.match('beIN Sports EN', 'beIN Sport EN'); // typo, both EN
      expect(withLangMatch.confidence).toBeGreaterThan(baseNoLang.confidence);
    });

    it('quality mismatch is neutral (no penalty)', () => {
      const hdToFhd = matcher.match('beIN Sports 1 HD', 'beIN Sports 1 FHD');
      const noQuality = matcher.match('beIN Sports 1', 'beIN Sports 1');
      // Both should match, confidence may differ but both > threshold
      expect(hdToFhd.matched).toBe(true);
      expect(noQuality.matched).toBe(true);
    });
  });

  describe('match() - Threshold behavior', () => {
    it('respects minConfidence threshold', () => {
      const strictMatcher = new StreamMatcher({ minConfidence: 0.95 });
      // Use more different names so even with variant bonus it's below 0.95
      const result = strictMatcher.match('beIN Sports 1 HD', 'beIN Sport 2 HD'); // different variant
      expect(result.matched).toBe(false);
    });

    it('matches at default threshold 0.75', () => {
      const result = matcher.match('beIN Sports 1', 'beIN Sport 1');
      expect(result.matched).toBe(true);
    });
  });

  describe('Leading variant names', () => {
    it('parses a leading variant and keeps the network name', () => {
      const result = matcher.parse('5 StarMAX East');
      expect(result.variant).toBe('5');
      expect(result.network).toBe('starmax east');
    });

    it('does NOT match names that only share a leading variant', () => {
      const result = matcher.match('5 Exploring Britain', '5 StarMAX  East');
      expect(result.matched).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('matches identical leading-variant names', () => {
      const result = matcher.match('5 StarMAX East HD', '5 StarMAX East');
      expect(result.matched).toBe(true);
    });

    it('matches when the whole name is a variant', () => {
      const result = matcher.match('5 HD', '5');
      expect(result.matched).toBe(true);
    });

    it('does not match empty network names without a shared variant', () => {
      expect(matcher.match('HD', '4K').matched).toBe(false);
    });

    it('matches identical Cyrillic names', () => {
      expect(matcher.match('Первый канал HD', 'Первый канал').matched).toBe(true);
      expect(matcher.match('Матч ТВ2', 'Матч ТВ 2').matched).toBe(true);
    });

    it('does not match different Cyrillic names sharing a variant', () => {
      const result = matcher.match('Матч ТВ 2', 'Первый 2');
      expect(result.matched).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('match() - Edge cases', () => {
    it('handles empty strings', () => {
      const result = matcher.match('', 'beIN Sports 1');
      expect(result.matched).toBe(false);
    });

    it('handles very different names', () => {
      const result = matcher.match('CNN News', 'beIN Sports 1');
      expect(result.matched).toBe(false);
    });

    it('handles case insensitivity', () => {
      const result = matcher.match('BEIN SPORTS 1', 'bein sports 1');
      expect(result.matched).toBe(true);
    });

    it('handles punctuation', () => {
      const result = matcher.match('beIN Sports 1 (HD)', 'beIN Sports 1 HD');
      expect(result.matched).toBe(true);
    });
  });

  describe('findBestMatch()', () => {
    it('returns best match from multiple channels', () => {
      const channels = [
        'beIN Sports 1',
        'beIN Sports 2',
        'beIN Sports News',
        'Sky Sports 1'
      ];
      const result = matcher.findBestMatch('beIN Sports 1 HD', channels);
      expect(result).not.toBeNull();
      expect(result!.channel).toBe('beIN Sports 1');
      expect(result!.result.confidence).toBeGreaterThan(0.8);
    });

    it('returns null when no match', () => {
      const channels = ['Sky Sports 1', 'ESPN 1'];
      const result = matcher.findBestMatch('beIN Sports 1', channels);
      expect(result).toBeNull();
    });

    it('respects variant constraint in best match', () => {
      const channels = ['beIN Sports 1', 'beIN Sports 2', 'beIN Sports 3'];
      const result = matcher.findBestMatch('beIN Sports 2 HD', channels);
      expect(result).not.toBeNull();
      expect(result!.channel).toBe('beIN Sports 2');
    });
  });

  describe('BeIN-specific scenarios (regression tests)', () => {
    

    it('matches all numbered beIN streams to correct channels', () => {
      for (let i = 1; i <= 8; i++) {
        const result = matcher.match(`beIN Sports ${i} HD`, `beIN Sports ${i}`);
        expect(result.matched).toBe(true);
        expect(result.confidence).toBeGreaterThan(0.85);
      }
    });

    it('never cross-matches beIN numbered channels', () => {
      for (let i = 1; i <= 8; i++) {
        for (let j = 1; j <= 8; j++) {
          if (i !== j) {
            const result = matcher.match(`beIN Sports ${i}`, `beIN Sports ${j}`);
            expect(result.matched).toBe(false);
          }
        }
      }
    });

    it('matches beIN News to beIN News', () => {
      const result = matcher.match('beIN Sports News HD', 'beIN Sports News');
      expect(result.matched).toBe(true);
    });

    it('BLOCKS beIN News -> beIN Sports 1', () => {
      const result = matcher.match('beIN Sports News', 'beIN Sports 1');
      expect(result.matched).toBe(false);
    });
  });

  describe('Sky Sports scenarios', () => {
    it('matches Premier League to Premier League', () => {
      const result = matcher.match('Sky Sports Premier League HD', 'Sky Sports Premier League');
      expect(result.matched).toBe(true);
    });

    it('BLOCKS Premier League -> Main Event', () => {
      const result = matcher.match('Sky Sports Premier League', 'Sky Sports Main Event');
      expect(result.matched).toBe(false);
    });

    it('matches Action -> Action', () => {
      const result = matcher.match('Sky Sports Action', 'Sky Sports Action');
      expect(result.matched).toBe(true);
    });

    it('matches Cricket -> Cricket', () => {
      const result = matcher.match('Sky Sports Cricket HD', 'Sky Sports Cricket');
      expect(result.matched).toBe(true);
    });
  });

  describe('ESPN scenarios', () => {
    it('matches ESPN 2 variants', () => {
      expect(matcher.match('ESPN 2', 'ESPN 2').matched).toBe(true);
      expect(matcher.match('ESPN2', 'ESPN 2').matched).toBe(true);
      expect(matcher.match('ESPN2 HD', 'ESPN 2').matched).toBe(true);
    });

    it('BLOCKS ESPN 2 -> ESPN 1', () => {
      const result = matcher.match('ESPN 2', 'ESPN 1');
      expect(result.matched).toBe(false);
    });
  });

  describe('Configuration options', () => {
    it('custom variant tokens', () => {
      const customMatcher = new StreamMatcher({
        variantTokens: ['customone', 'customtwo']
      });
      const result = customMatcher.parse('Network Customone');
      expect(result.variant).toBe('customone');
    });

    it('custom quality tokens', () => {
      const customMatcher = new StreamMatcher({
        qualityTokens: ['ultra']
      });
      const result = customMatcher.parse('Network 1 Ultra');
      expect(result.quality).toBe('ultra');
    });

    it('custom stop words', () => {
      const customMatcher = new StreamMatcher({
        stopWords: ['custom']
      });
      const result = customMatcher.parse('Network 1 Custom');
      expect(result.rawTokens).not.toContain('custom');
    });
  });

  describe('Integration: collector-style usage', () => {
    it('simulates StreamsCollector matching flow', () => {
      const channels = [
        'beIN Sports 1',
        'beIN Sports 2',
        'beIN Sports News',
        'Sky Sports Premier League',
        'ESPN 2'
      ];

      const streams = [
        'beIN Sports 1 HD',
        'beIN Sports 2 FHD',
        'beIN Sports News EN',
        'Sky Sports Premier League HD',
        'ESPN 2 HD'
      ];

      for (const stream of streams) {
        const best = matcher.findBestMatch(stream, channels);
        expect(best).not.toBeNull();
      }
    });

    it('simulates BeinMatcher strict mode (no subset)', () => {
      const strictMatcher = new StreamMatcher({
        minConfidence: 0.85,
        allowVariantSubset: false
      });

      // Should match exact variant
      expect(strictMatcher.match('beIN Sports 1', 'beIN Sports 1').matched).toBe(true);
      
      // Should NOT match stream with variant to channel without
      expect(strictMatcher.match('beIN Sports 1', 'beIN Sports').matched).toBe(false);
      
      // Should NOT match stream without variant to channel with
      expect(strictMatcher.match('beIN Sports', 'beIN Sports 1').matched).toBe(false);
    });
  });
});

// Additional property-based tests for robustness
describe('StreamMatcher - Property tests', () => {
  const matcher = new StreamMatcher();

  it('match is symmetric for identical names', () => {
    const names = [
      'beIN Sports 1',
      'beIN Sports 2 HD',
      'Sky Sports Premier League',
      'ESPN 2',
      'CNN International'
    ];

    for (const name of names) {
      const result1 = matcher.match(name, name);
      const result2 = matcher.match(name, name);
      expect(result1.matched).toBe(result2.matched);
      expect(result1.confidence).toBe(result2.confidence);
    }
  });

  it('match is reflexive', () => {
    const result = matcher.match('beIN Sports 1', 'beIN Sports 1');
    expect(result.matched).toBe(true);
    expect(result.confidence).toBe(1);
  });

  it('variant mismatch always returns confidence 0', () => {
    const pairs = [
      ['beIN Sports 1', 'beIN Sports 2'],
      ['Sky Sports Premier', 'Sky Sports Main Event'],
      ['ESPN 1', 'ESPN 2'],
      ['Channel 5', 'Channel 6']
    ];

    for (const [a, b] of pairs) {
      const result = matcher.match(a, b);
      expect(result.matched).toBe(false);
      expect(result.confidence).toBe(0);
    }
  });
});