package org.devlive.infosphere.common.response;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.util.List;

@Data
@ToString
@NoArgsConstructor
@AllArgsConstructor
@SuppressFBWarnings(value = {"EI_EXPOSE_REP", "EI_EXPOSE_REP2"})
public class JwtResponse
{
    private String token;
    private String type = "Bearer";
    private Long id;
    private String username;
    private List<String> roles;
    private String avatar;

    public JwtResponse(String accessToken, Long id, String username, List<String> roles, String avatar)
    {
        this.token = accessToken;
        this.id = id;
        this.username = username;
        this.roles = roles;
        this.avatar = avatar;
    }
}
