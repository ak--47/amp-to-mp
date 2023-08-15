# amp-to-mp
this module will take in (uncompressed) amplitude raw files, transform them, and send them to mixpanel.

this module can be used in combination with [`amp-ext`](https://github.com/ak--47/amp-ext) to do a full historical migration

it is implemented as a CLI and requires [Node.js](https://nodejs.org/en/download).

## usage
```bash
npx amp-to-mp --dir ./data ---token bar --secret qux --project foo
```

### help / options
```bash
npx amp-to-mp --help
```
