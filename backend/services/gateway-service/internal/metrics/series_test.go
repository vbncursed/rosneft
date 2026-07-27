package metrics

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type SeriesSuite struct {
	suite.Suite
}

func TestSeriesSuite(t *testing.T) {
	suite.Run(t, new(SeriesSuite))
}

func (s *SeriesSuite) TestParseRange() {
	body := `{"status":"success","data":{"result":[
		{"metric":{"service":"auth"},"values":[[1000,"1.5"],[1015,"2"]]}]}}`
	got, err := parseProm([]byte(body))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 1)
	assert.Equal(s.T(), got[0].Label, "auth")
	assert.Equal(s.T(), len(got[0].Points), 2)
	assert.Equal(s.T(), got[0].Points[0], Point{T: 1000, V: 1.5})
}

func (s *SeriesSuite) TestParseInstant() {
	body := `{"status":"success","data":{"result":[
		{"metric":{},"value":[1000,"3"]}]}}`
	got, err := parseProm([]byte(body))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 1)
	assert.Equal(s.T(), got[0].Label, "value")
	assert.Equal(s.T(), got[0].Points[0].V, float64(3))
}

func (s *SeriesSuite) TestParseErrorStatus() {
	_, err := parseProm([]byte(`{"status":"error","error":"bad query"}`))
	assert.ErrorContains(s.T(), err, "bad query")
}

func (s *SeriesSuite) TestNonFiniteDropped() {
	// histogram_quantile with no traffic yields NaN/Inf — not points. A series
	// with only non-finite samples is omitted entirely.
	body := `{"status":"success","data":{"result":[
		{"metric":{"service":"x"},"values":[[1000,"NaN"],[1015,"+Inf"]]}]}}`
	got, err := parseProm([]byte(body))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *SeriesSuite) TestLabelPriority() {
	// alertname wins over service so an ALERTS series keeps its alert identity.
	assert.Equal(s.T(), labelOf(map[string]string{"alertname": "HighErr", "service": "auth"}), "HighErr")
	assert.Equal(s.T(), labelOf(map[string]string{"__name__": "up", "instance": "a"}), "instance=a")
	assert.Equal(s.T(), labelOf(map[string]string{}), "value")
}

func (s *SeriesSuite) TestStepRoundsToScrape() {
	// 1h/200 ≈ 18s → rounded to a whole 15s scrape; never below one scrape.
	assert.Equal(s.T(), stepSeconds(3600), 15)
	assert.Equal(s.T(), stepSeconds(604800)%scrapeSeconds, 0)
	assert.Assert(s.T(), stepSeconds(604800) >= scrapeSeconds)
}
