# nct

**Namecoin tool** - a command line tool for managing Namecoin names

## Usage

`nct <command> [arguments]`

### Commands

#### `list`

Show a list of names controlled by your wallet

#### `info <name>`

Show info about a name

#### `cat <name>`

Print the contents of a name. If the value is JSON, it is pretty-printed.

#### `edit <name>`

Edit a name. Opens your $EDITOR and saves the result when the editor exits. If
the value is JSON, it is pretty-printed for the editor and then printed
compactly for sending the update. If the JSON data saved is invalid, you are
prompted to edit it again.

#### `update-expiring`

Update all names that are pending expiration.

## License

Fair License (Fair)

© 2015 Charles Lehner

Usage of the works is permitted provided that this instrument is retained with
the works, so that any entity that uses the works is notified of this
instrument.

DISCLAIMER: THE WORKS ARE WITHOUT WARRANTY.
