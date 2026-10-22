# User-operated dialogue trace

Use the window titled `FreeJ2ME-Plus - SCN-0004 dialogue trace`. Load the same Ronin save, reach the Villager and open the dialogue. Stop at the first dialogue page so it can be captured. After that checkpoint, continue through the conversation and close this trace window to flush the trace.

The trace build instruments `ag.a(II)V` entry/normal return and carries the existing scheduler/render hooks. It runs from an isolated copy of HOUSE-INPUT-001. The original JARs are not modified.
