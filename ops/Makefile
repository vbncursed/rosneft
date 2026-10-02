# `make -C ops check` — shellcheck, then the hermetic script tests.
SHELLCHECK := $(shell command -v shellcheck 2>/dev/null)
ifeq ($(SHELLCHECK),)
SHELLCHECK := docker run --rm -v "$(CURDIR)":/mnt -w /mnt koalaman/shellcheck:stable
endif

.PHONY: check
check:
	$(SHELLCHECK) -x -S warning deploy/*.sh backup/*.sh
	bash deploy/deploy_test.sh
	bash backup/dump_test.sh
