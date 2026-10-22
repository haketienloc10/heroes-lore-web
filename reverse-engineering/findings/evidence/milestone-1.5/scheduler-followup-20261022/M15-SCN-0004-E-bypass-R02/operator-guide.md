# User-operated scheduler bypass trace

The target trigger is a natural Right Soft key while `m.e:I=4`. Under the Motorola profile, the recorded host mapping uses W for Right Soft, which reaches `ar.keyPressed(I)V` as raw -22 and is normalized to -8 before dispatch to `ag.a(II)V`. The original `br.b()V` then branches around `br.a(JJ)V` while `ag.a:Z` is true. A previous route trace saw state 4 for about 286 ms.

This run sets only the copied emulator game profile to `Motorola`; the fixture source and JARs are unchanged. With the recorded Right Soft mapping, press **W** once as soon as `NOW LOADING` appears while leaving the house. The action sets an internal scheduler flag, so no visible UI response is expected. The transition window is about 286 ms; if missed, return indoors and repeat while this window remains open. No harness input is sent.

The copy-only probe records raw key callback arguments, the actual `m.e:I` operand at the key handler's tableswitch, `ag.a(II)V` arguments, the `ag.a:Z` operand immediately before `br.b`'s original `IFNE`, and entry/exit for `br.b` and `br.a(JJ)V`. It uses no reflection, game field reads/writes, or input injection. Its shutdown gate serializes a contiguous prefix and marks method spans without exits as censored.
