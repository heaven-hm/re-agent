# Native Windows to macOS reconstruction records

These target records index the Batch 1 applications reconstructed from observed Windows binaries. Each report distinguishes tested behavior from the full application. Binary identity, methods and known gaps are recorded in the linked manifest and global reports. No report claims byte-identical executables or universal equivalence.

| Target              | Result scope                                                          | Record                           |
| ------------------- | --------------------------------------------------------------------- | -------------------------------- |
| TicTacToe-AI        | `CheckGameStatus` over all 19,683 board states; feature-scope PASS    | [tictactoe.md](tictactoe.md)     |
| Snake               | Static frame and game-over structure observations; PARTIAL overall    | [snake.md](snake.md)             |
| PixelTetris         | Native build, menu and a live gameplay state; PARTIAL overall         | [pixeltetris.md](pixeltetris.md) |
| Tetris              | Native build, menu and a live gameplay state; PARTIAL overall         | [tetris.md](tetris.md)           |
| Legacy Notepad      | Native UI, typing, save bytes; PARTIAL overall                        | [notepad.md](notepad.md)         |
| Clipjar             | Synthetic persistence/deduplication tests; PARTIAL overall            | [clipjar.md](clipjar.md)         |
| GConv QVM toolchain | 120/120 observed script error-parity cases; PARTIAL overall           | [gconv.md](gconv.md)             |
| Apple Calculator    | 10/10 finite basic arithmetic display comparisons; feature-scope PASS | [calculator.md](calculator.md)   |
| imgview             | PNG display slice; PARTIAL overall                                    | [imgview.md](imgview.md)         |

Batch 2 target records remain under [native-batch-2/reports](../../../native-batch-2/reports/), with one record for each of fd, ripgrep, bat, OpenLieroX, SuperTux and The Powder Toy.
