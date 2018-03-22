import os
import string
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "treeherder.config.settings")

import django  # noqa: E402
django.setup()

from django.conf import settings  # noqa: E402

from treeherder.model.models import Bugscache, Matcher, TextLogErrorMatch  # noqa: E402


print('Current DB: {}'.format(settings.DATABASES['default']['HOST']))

# get first 5 matches for all matchers
# matches = []
# for matcher in Matcher.objects.all():
#     m = TextLogErrorMatch.objects.filter(matcher=matcher)[:5]

#     if len(m) < 1:
#         print('Found no matches with: {}'.format(matcher.name))
#         continue

#     matches.extend(m)

# print('Matched errors: {}'.format(len(matches)))

matches = TextLogErrorMatch.objects.filter(matcher__name='CrashSignatureMatcher')
for match in matches:
    bug_number = match.classified_failure.bug_number
    if bug_number == 0:
        continue

    line = match.text_log_error.line
    print('Bug:  {}'.format(bug_number))
    print('Line: {}'.format(line))
    break

# BUG
# Intermittent dom/media/webspeech/synth/test/test_speech_simple.html | application crashed [@ mozalloc_abort]

# LINE
# 03:09:18     INFO - PROCESS-CRASH | Main app process exited normally | application crashed [@ mozalloc_abort]

# replace_punctuation = string.maketrans(string.punctuation, ' ' * len(string.punctuation))

# a = '03:09:18     INFO - PROCESS-CRASH | Main app process exited normally | application crashed [@ mozalloc_abort]'
# line = a.translate(replace_punctuation)
# items = line.split(' ')
# non_empty = filter(None, items)
# query = ' & '.join(non_empty)

line = '03:09:18     INFO - PROCESS-CRASH | Main app process exited normally | application crashed [@ mozalloc_abort]'

bugs = Bugscache.objects.using('pg').filter(summary__search=line)
print(bugs.query)
print('Bugs found: {}'.format(bugs.count()))

# TextLogError - TextLogErrorMetadata - FailureLine

# TODO: find a match with a bug number attached
# given a log line try to match to the same bug

# add postgres as a db via routing
# how to store docs in postgres from mysql?
