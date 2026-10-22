# User-operated scheduler bypass trace

The target trigger is a natural Back key while `m.e:I=4`: `ar.keyPressed(I)V` routes state 4 to `ag.a(II)V`; the original `br.b()V` then branches around `br.a(JJ)V` while `ag.a:Z` is true. The previous scout saw state 4 for about 286 ms, so the Back press may need a few attempts.

Load the Ronin save in the house. Press Down once to exit toward town. As soon as `NOW LOADING` appears, press the same Back/Esc action used to leave Options once. If the loading screen has already ended, repeat from the room; do not press Back before loading starts. Report whether `NOW LOADING` appeared and whether you managed a Back press during it. No harness input is sent.

The copy-only probe records raw key callback arguments, the actual `m.e:I` operand at the key handler's tableswitch, `ag.a(II)V` arguments, the `ag.a:Z` operand immediately before `br.b`'s original `IFNE`, and entry/exit for `br.b` and `br.a(JJ)V`. It uses no reflection, game field reads/writes, or input injection. Its shutdown gate serializes a contiguous prefix and marks method spans without exits as censored.
