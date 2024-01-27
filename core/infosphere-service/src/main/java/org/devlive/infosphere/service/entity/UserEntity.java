package org.devlive.infosphere.service.entity;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.EntityListeners;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.JoinTable;
import javax.persistence.OneToMany;
import javax.persistence.Table;
import javax.persistence.Transient;

import java.time.Instant;
import java.util.List;

@Data
@ToString
@NoArgsConstructor
// 禁用: 防止 Failed to evaluate Jackson deserialization for type
//@AllArgsConstructor
@Entity
@Table(name = "infosphere_user")
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@EntityListeners(AuditingEntityListener.class)
public class UserEntity
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "username")
    private String username;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @Column(name = "password")
    private String password;

    @Column(name = "avatar")
    private String avatar;

    @Column(name = "alias_name")
    private String aliasName;

    @Column(name = "signature")
    private String signature;

    @Column(name = "email")
    private String email;

    @Column(name = "active")
    private boolean active = false;

    @Column(name = "locked")
    private boolean locked = false;

    @Column(name = "create_time")
    @CreatedDate
    private Instant createTime;

    @Column(name = "update_time")
    @LastModifiedDate
    private Instant updateTime;

    @OneToMany
    @JoinTable(name = "infosphere_user_role_relation",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id"))
    private List<RoleEntity> roles;

    @Transient
    private String conformPassword;
}
