# `make -C ops check` — shellcheck, then the hermetic script tests.
# shellcheck is always the pinned docker image: a runner's preinstalled version
# and a developer's disagree (SC2317 vs SC2329) and a gate must not depend on either.
SHELLCHECK := docker run --rm -v "$(CURDIR)":/mnt -w /mnt koalaman/shellcheck:v0.11.0

.PHONY: check
check:
	$(SHELLCHECK) -x deploy/*.sh backup/*.sh
	bash deploy/deploy_test.sh
	bash backup/dump_test.sh
